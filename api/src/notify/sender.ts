import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<void>;
}

export class SesSender implements EmailSender {
  constructor(
    private readonly client: SESClient,
    private readonly from: string,
  ) {}

  async send(email: OutgoingEmail): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: [email.to] },
        Message: {
          Subject: { Data: email.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: email.text, Charset: 'UTF-8' }, Html: { Data: email.html, Charset: 'UTF-8' } },
        },
      }),
    );
  }
}

export class MemorySender implements EmailSender {
  readonly sent: OutgoingEmail[] = [];
  failFor?: (email: OutgoingEmail) => boolean;

  async send(email: OutgoingEmail): Promise<void> {
    if (this.failFor?.(email)) throw new Error(`simulated send failure to ${email.to}`);
    this.sent.push(email);
  }
}
