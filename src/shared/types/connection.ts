/** WhatsApp connection lifecycle states. */
export type ConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'qr'; qrData: string }
  | { status: 'connected'; phoneNumber: string }
  | { status: 'error'; message: string };
