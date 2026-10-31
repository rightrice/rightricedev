"""Private WSGI contact relay. Run behind an HTTPS reverse proxy with Gunicorn."""
import hmac
import json
import os
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formatdate

EMAIL = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}", re.ASCII)
MAX_BODY = 65536


def valid_email(value):
    return isinstance(value, str) and len(value) <= 254 and EMAIL.fullmatch(value) is not None


def build_message(data, config):
    if not isinstance(data, dict):
        raise ValueError('Invalid payload')
    if not valid_email(data.get('replyTo')):
        raise ValueError('Invalid reply address')
    text, identifier = data.get('text'), data.get('id')
    if not isinstance(text, str) or not text.strip() or len(text) > 20000 or '\x00' in text:
        raise ValueError('Invalid message')
    if not isinstance(identifier, str) or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', identifier):
        raise ValueError('Invalid submission ID')
    message = EmailMessage()
    # Sender and recipient are fixed by the operator, never selected by the caller.
    message['From'] = config['CONTACT_FROM_EMAIL']
    message['To'] = config['CONTACT_TO_EMAIL']
    message['Reply-To'] = data['replyTo']
    message['Subject'] = 'New rightrice.dev contact message'
    message['Date'] = formatdate(localtime=False)
    message['Message-ID'] = '<contact.{}@{}>'.format(identifier, config['CONTACT_FROM_EMAIL'].split('@')[1])
    message.set_content(text)
    return message


def deliver(message, config):
    context = ssl.create_default_context()
    if config['SMTP_SECURITY'] == 'tls':
        smtp = smtplib.SMTP_SSL(config['SMTP_HOST'], int(config.get('SMTP_PORT', '465')), timeout=10, context=context)
    else:
        smtp = smtplib.SMTP(config['SMTP_HOST'], int(config.get('SMTP_PORT', '587')), timeout=10)
    try:
        if config['SMTP_SECURITY'] == 'starttls':
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
        smtp.login(config['SMTP_USERNAME'], config['SMTP_PASSWORD'])
        refused = smtp.send_message(message, from_addr=config['CONTACT_FROM_EMAIL'], to_addrs=[config['CONTACT_TO_EMAIL']])
        if refused:
            raise smtplib.SMTPRecipientsRefused(refused)
    finally:
        # QUIT failures after DATA acceptance must not incorrectly report a failed send.
        smtp.close()


def create_app(config=None, mailer=deliver):
    config = dict(os.environ if config is None else config)
    required = ('CONTACT_RELAY_TOKEN', 'CONTACT_FROM_EMAIL', 'CONTACT_TO_EMAIL', 'SMTP_HOST', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_SECURITY')
    if any(not config.get(key) for key in required):
        raise ValueError('Missing relay configuration')
    if len(config['CONTACT_RELAY_TOKEN']) < 32 or not config['CONTACT_RELAY_TOKEN'].isascii():
        raise ValueError('Use a random ASCII relay token of at least 32 characters')
    if not all(valid_email(config[key]) for key in ('CONTACT_FROM_EMAIL', 'CONTACT_TO_EMAIL')):
        raise ValueError('Invalid configured mailbox')
    if config['SMTP_SECURITY'] not in ('tls', 'starttls'):
        raise ValueError('SMTP_SECURITY must be tls or starttls')
    if not 1 <= int(config.get('SMTP_PORT', '587')) <= 65535:
        raise ValueError('Invalid SMTP port')

    def app(environ, start_response):
        def respond(status, payload):
            body = json.dumps(payload).encode()
            start_response(status, [('Content-Type', 'application/json'), ('Cache-Control', 'no-store'), ('Content-Length', str(len(body)))])
            return [body]
        if environ.get('PATH_INFO') != '/contact':
            return respond('404 Not Found', {'ok': False})
        if environ.get('REQUEST_METHOD') != 'POST':
            return respond('405 Method Not Allowed', {'ok': False})
        supplied = environ.get('HTTP_AUTHORIZATION', '').encode('utf-8')
        expected = ('Bearer ' + config['CONTACT_RELAY_TOKEN']).encode('ascii')
        if not hmac.compare_digest(supplied, expected):
            return respond('401 Unauthorized', {'ok': False})
        if environ.get('CONTENT_TYPE', '').split(';')[0].strip().lower() != 'application/json':
            return respond('415 Unsupported Media Type', {'ok': False})
        try:
            length = int(environ.get('CONTENT_LENGTH', ''))
            if length <= 0 or length > MAX_BODY:
                return respond('413 Payload Too Large', {'ok': False})
            raw = environ['wsgi.input'].read(length)
            if len(raw) != length:
                raise ValueError('Incomplete body')
            data = json.loads(raw)
            message = build_message(data, config)
        except (ValueError, UnicodeError):
            return respond('400 Bad Request', {'ok': False})
        try:
            mailer(message, config)
        except (OSError, smtplib.SMTPException):
            return respond('502 Bad Gateway', {'ok': False})
        return respond('200 OK', {'ok': True})
    return app
