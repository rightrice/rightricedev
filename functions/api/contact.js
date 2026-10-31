import { handleContact } from '../../lib/contact.js';

export function onRequest({ request, env }) {
  return handleContact(request, env);
}
