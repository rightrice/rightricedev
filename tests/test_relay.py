import io
import json
import smtplib
import unittest
from unittest.mock import patch, MagicMock
from relay.app import create_app, deliver

CONFIG = dict(CONTACT_RELAY_TOKEN='test-token-123456789012345678901234', CONTACT_FROM_EMAIL='contact@example.com', CONTACT_TO_EMAIL='owner@example.com', SMTP_HOST='smtp.example.com', SMTP_PORT='587', SMTP_SECURITY='starttls', SMTP_USERNAME='user', SMTP_PASSWORD='test-password')
DATA = dict(replyTo='visitor@example.org', text='Message\n\nSender IP: 2001:db8::1', id='12345678-1234-4123-8123-123456789012')

class RelayTests(unittest.TestCase):
    def call(self, data=DATA, auth=True, mailer=None):
        raw = json.dumps(data).encode()
        self.messages = []
        app = create_app(CONFIG, mailer or (lambda message, config: self.messages.append(message)))
        environ = dict(PATH_INFO='/contact', REQUEST_METHOD='POST', CONTENT_TYPE='application/json', CONTENT_LENGTH=str(len(raw)), **{'wsgi.input': io.BytesIO(raw)})
        if auth:
            environ['HTTP_AUTHORIZATION'] = 'Bearer ' + CONFIG['CONTACT_RELAY_TOKEN']
        statuses = []
        response = b''.join(app(environ, lambda status, headers: statuses.append(status)))
        return statuses[0], json.loads(response)

    def test_fixed_recipient_plain_text_and_reply(self):
        status, body = self.call(dict(DATA, to='evil@example.com', subject='Injected'))
        self.assertEqual(status, '200 OK')
        message = self.messages[0]
        self.assertEqual(message['To'], CONFIG['CONTACT_TO_EMAIL'])
        self.assertEqual(message['Reply-To'], DATA['replyTo'])
        self.assertEqual(message['Subject'], 'New rightrice.dev contact message')
        self.assertEqual(message.get_content_type(), 'text/plain')
        self.assertIn('2001:db8::1', message.get_content())

    def test_unauthorized_cannot_send(self):
        self.assertEqual(self.call(auth=False)[0], '401 Unauthorized')
        self.assertEqual(self.messages, [])

    def test_header_injection_rejected(self):
        self.assertEqual(self.call(dict(DATA, replyTo='visitor@example.org\r\nBcc:bad@example.org'))[0], '400 Bad Request')
        self.assertEqual(self.messages, [])

    def test_bad_payloads_rejected(self):
        for data in [[], {}, dict(DATA, text=''), dict(DATA, id='bad'), dict(DATA, text='a' * 20001)]:
            self.assertEqual(self.call(data)[0], '400 Bad Request')

    def test_smtp_failure_is_not_success(self):
        def broken(message, config):
            raise smtplib.SMTPException('private internal error')
        status, body = self.call(mailer=broken)
        self.assertEqual(status, '502 Bad Gateway')
        self.assertEqual(body, {'ok': False})

    def test_starttls_before_login_and_fixed_envelope(self):
        smtp = MagicMock()
        smtp.send_message.return_value = {}
        with patch('relay.app.smtplib.SMTP', return_value=smtp):
            self.call(mailer=deliver)
        names = [call[0] for call in smtp.method_calls]
        self.assertLess(names.index('starttls'), names.index('login'))
        self.assertEqual(smtp.send_message.call_args.kwargs['to_addrs'], ['owner@example.com'])
        smtp.close.assert_called_once()

    def test_tls_cannot_be_disabled(self):
        with self.assertRaises(ValueError):
            create_app(dict(CONFIG, SMTP_SECURITY='none'))

if __name__ == '__main__':
    unittest.main()
