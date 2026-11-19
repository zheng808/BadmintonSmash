import {
  formatCents, formatEventRange,
  type DomainEventType, type Event, type PaymentHandles, type Profile, type Signup,
} from '@badmintonsmash/shared';

export interface TemplateContext {
  event: Event;
  recipient: Profile;
  host: Profile;
  signup?: Signup;
  position?: number;
  payload?: Record<string, unknown>;
  appWebUrl: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Types every active participant must receive; cannot be opted out. */
export const ESSENTIAL_TYPES: ReadonlySet<DomainEventType> = new Set(['signup.promoted', 'event.cancelled', 'fee.finalized', 'event.updated']);

const HANDLE_LABELS: Array<[keyof PaymentHandles, string, string]> = [
  ['etransfer', 'e-Transfer', '电子转账'],
  ['venmo', 'Venmo', 'Venmo'],
  ['zelle', 'Zelle', 'Zelle'],
  ['paypal', 'PayPal', 'PayPal'],
  ['wechat', 'WeChat Pay', '微信支付'],
  ['alipay', 'Alipay', '支付宝'],
  ['other', 'Other', '其他'],
];

export function formatHandles(h: PaymentHandles, lang: 'en' | 'zh'): string[] {
  return HANDLE_LABELS.filter(([k]) => h[k]).map(([k, en, zh]) => `${lang === 'en' ? en : zh}: ${h[k]}`);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

function wrap(subject: string, en: string[], zh: string[], link: string, linkLabel: string): RenderedEmail {
  const text = [...en, '', ...zh, '', `${linkLabel}: ${link}`].join('\n');
  const para = (lines: string[]) => lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('\n');
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#1a1a1a">
${para(en)}
<hr style="border:none;border-top:1px solid #ddd;margin:16px 0" />
${para(zh)}
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#208AEF;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(linkLabel)}</a></p>
</body></html>`;
  return { subject, text, html };
}

export function renderEmail(type: DomainEventType, ctx: TemplateContext): RenderedEmail {
  const { event, recipient, host } = ctx;
  const when = formatEventRange(event.startsAt, event.endsAt, event.timezone);
  const whenZh = formatEventRange(event.startsAt, event.endsAt, event.timezone, 'zh-CN');
  const link = `${ctx.appWebUrl.replace(/\/$/, '')}/e/${event.eventId}`;
  const linkLabel = 'Open event / 查看活动';
  const name = recipient.displayName;
  const venue = event.venue.name;
  const title = event.title;
  const currency = event.fee.currency;

  switch (type) {
    case 'signup.confirmed':
      return wrap(
        `You're in: ${title} / 报名成功：${title}`,
        [`Hi ${name}, you're confirmed for ${title}.`, `When: ${when}`, `Where: ${venue}`],
        [`${name}，您好！您已成功报名「${title}」。`, `时间：${whenZh}`, `地点：${venue}`],
        link, linkLabel,
      );
    case 'signup.waitlisted': {
      const pos = ctx.position ?? ctx.signup?.seq;
      const posEn = ctx.position ? ` You are #${ctx.position} on the waitlist.` : '';
      const posZh = ctx.position ? `您在候补名单中排第 ${ctx.position} 位。` : '';
      void pos;
      return wrap(
        `Waitlisted${ctx.position ? ` #${ctx.position}` : ''}: ${title} / 已加入候补：${title}`,
        [`Hi ${name}, ${title} is full.${posEn} We'll email you the moment a spot opens.`, `When: ${when}`, `Where: ${venue}`],
        [`${name}，您好！「${title}」名额已满。${posZh}一旦有空位，我们会立即邮件通知您。`, `时间：${whenZh}`, `地点：${venue}`],
        link, linkLabel,
      );
    }
    case 'signup.promoted':
      return wrap(
        `A spot opened up, you're in: ${title} / 有空位了，您已入选：${title}`,
        [`Hi ${name}, a spot opened up and you're now confirmed for ${title}.`, `When: ${when}`, `Where: ${venue}`, `If you can't make it, please leave the event so the next person can play.`],
        [`${name}，您好！「${title}」有空位了，您已被正式确认。`, `时间：${whenZh}`, `地点：${venue}`, `如果无法参加，请及时退出活动，把名额让给下一位。`],
        link, linkLabel,
      );
    case 'signup.removed': {
      const reason = typeof ctx.payload?.reason === 'string' ? ctx.payload.reason : undefined;
      return wrap(
        `Removed from ${title} / 已从活动中移除：${title}`,
        [`Hi ${name}, the host removed you from ${title}.${reason ? ` Reason: ${reason}` : ''}`, `Questions? Contact ${host.displayName}.`],
        [`${name}，您好！组织者已将您从「${title}」中移除。${reason ? `原因：${reason}` : ''}`, `如有疑问，请联系 ${host.displayName}。`],
        link, linkLabel,
      );
    }
    case 'event.updated':
      return wrap(
        `Change to ${title} / 活动信息变更：${title}`,
        [`Hi ${name}, the details for ${title} changed.`, `When: ${when}`, `Where: ${venue}${event.venue.address ? ` (${event.venue.address})` : ''}`, `Please check the event and leave if you can no longer make it.`],
        [`${name}，您好！「${title}」的活动信息已更新。`, `时间：${whenZh}`, `地点：${venue}${event.venue.address ? `（${event.venue.address}）` : ''}`, `请查看活动详情，如无法参加请及时退出。`],
        link, linkLabel,
      );
    case 'event.cancelled': {
      const reason = typeof ctx.payload?.reason === 'string' ? ctx.payload.reason : undefined;
      return wrap(
        `${title} is cancelled / 活动已取消：${title}`,
        [`Hi ${name}, ${title} on ${when} has been cancelled by ${host.displayName}.${reason ? ` Reason: ${reason}` : ''}`, `You don't owe anything for this event.`],
        [`${name}，您好！${host.displayName} 已取消 ${whenZh} 的「${title}」。${reason ? `原因：${reason}` : ''}`, `此活动无需付款。`],
        link, linkLabel,
      );
    }
    case 'fee.finalized': {
      const amounts = (ctx.payload?.amounts ?? {}) as Record<string, number>;
      const amount = ctx.signup?.amountOwedCents ?? amounts[recipient.userId] ?? 0;
      const money = formatCents(amount, currency);
      const handlesEn = formatHandles(host.paymentHandles, 'en');
      const handlesZh = formatHandles(host.paymentHandles, 'zh');
      return wrap(
        `You owe ${money} for ${title} / 待付款 ${money}：${title}`,
        [
          `Hi ${name}, costs for ${title} (${when}) are settled. Your share is ${money}.`,
          `Please pay ${host.displayName}:`,
          ...(handlesEn.length ? handlesEn : ['(ask the host how they would like to be paid)']),
          `After paying, tap "I've paid" in the app so the host can confirm it.`,
        ],
        [
          `${name}，您好！「${title}」（${whenZh}）的费用已结算，您应付 ${money}。`,
          `请付款给 ${host.displayName}：`,
          ...(handlesZh.length ? handlesZh : ['（请向组织者确认付款方式）']),
          `付款后请在应用中点击“我已付款”，方便组织者确认。`,
        ],
        link, linkLabel,
      );
    }
    case 'payment.recorded': {
      const amount = ctx.signup?.amountOwedCents ?? (typeof ctx.payload?.amountOwedCents === 'number' ? ctx.payload.amountOwedCents : 0);
      const money = formatCents(amount, currency);
      return wrap(
        `Payment received for ${title} / 已收到付款：${title}`,
        [`Hi ${name}, ${host.displayName} marked your ${money} for ${title} as paid. Thank you!`],
        [`${name}，您好！${host.displayName} 已确认收到您为「${title}」支付的 ${money}。谢谢！`],
        link, linkLabel,
      );
    }
  }
}
