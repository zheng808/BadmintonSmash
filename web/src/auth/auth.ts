/**
 * Passwordless email sign-in on Cognito's USER_AUTH flow (EMAIL_OTP first factor), plus Google.
 *
 * New users: signUp without a password -> confirmSignUp(code) -> autoSignIn() using the session that
 * ConfirmSignUp returns, so one code signs them up and in. Existing users: signUp throws
 * UsernameExistsException -> signIn with preferredChallenge EMAIL_OTP -> confirmSignIn(code).
 */
import {
  autoSignIn,
  confirmSignIn,
  confirmSignUp,
  fetchAuthSession,
  resendSignUpCode,
  signIn,
  signInWithRedirect,
  signOut as amplifySignOut,
  signUp,
} from 'aws-amplify/auth';

export type CodeMode = 'signup' | 'signin';
export type StartOutcome = { kind: 'code'; mode: CodeMode } | { kind: 'done' };

const OTP = { authFlowType: 'USER_AUTH', preferredChallenge: 'EMAIL_OTP' } as const;

function errorName(e: unknown): string {
  return e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
}

async function beginCodeSignIn(email: string): Promise<'code' | 'done'> {
  const { isSignedIn, nextStep } = await signIn({ username: email, options: OTP });
  if (isSignedIn) return 'done';
  if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE') return 'code';
  if (nextStep.signInStep === 'CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION') {
    const picked = await confirmSignIn({ challengeResponse: 'EMAIL_OTP' });
    if (picked.isSignedIn) return 'done';
    if (picked.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE') return 'code';
  }
  throw new Error(`Unsupported sign-in step: ${nextStep.signInStep}`);
}

/** Sends a one-time code to the address, creating the account first when it does not exist. */
export async function startEmailSignIn(email: string): Promise<StartOutcome> {
  try {
    await signUp({ username: email, options: { userAttributes: { email }, autoSignIn: OTP } });
    return { kind: 'code', mode: 'signup' };
  } catch (e) {
    if (errorName(e) !== 'UsernameExistsException') throw e;
  }
  try {
    const r = await beginCodeSignIn(email);
    return r === 'done' ? { kind: 'done' } : { kind: 'code', mode: 'signin' };
  } catch (e) {
    if (errorName(e) === 'UserNotConfirmedException') {
      await resendSignUpCode({ username: email });
      return { kind: 'code', mode: 'signup' };
    }
    throw e;
  }
}

/** Confirms the code. Returns 'signin' when a second code was needed (rare), otherwise 'done'. */
export async function confirmEmailCode(email: string, code: string, mode: CodeMode): Promise<'done' | 'signin'> {
  if (mode === 'signin') {
    const { isSignedIn, nextStep } = await confirmSignIn({ challengeResponse: code });
    if (isSignedIn) return 'done';
    throw new Error(`Unsupported sign-in step: ${nextStep.signInStep}`);
  }
  const { nextStep } = await confirmSignUp({ username: email, confirmationCode: code });
  if (nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
    const r = await autoSignIn();
    if (r.isSignedIn) return 'done';
    if (r.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE') return 'signin';
  }
  // Confirmed without an auto sign-in session (e.g. a resumed sign-up): start a normal code sign-in.
  return (await beginCodeSignIn(email)) === 'done' ? 'done' : 'signin';
}

export async function resendEmailCode(email: string, mode: CodeMode): Promise<void> {
  if (mode === 'signup') await resendSignUpCode({ username: email });
  else await beginCodeSignIn(email);
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithRedirect({ provider: 'Google' });
}

export async function signOut(): Promise<void> {
  await amplifySignOut();
}

export async function getAccessToken(): Promise<string | undefined> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.accessToken?.toString();
  } catch {
    return undefined;
  }
}

export async function getSessionUserId(): Promise<string | undefined> {
  try {
    const session = await fetchAuthSession();
    const sub = session.tokens?.accessToken?.payload?.sub;
    return typeof sub === 'string' ? sub : undefined;
  } catch {
    return undefined;
  }
}

/** True inside WeChat's in-app browser, where Google blocks OAuth (403 disallowed_useragent). */
export function isWeChatBrowser(): boolean {
  return /MicroMessenger/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent);
}

export type AuthErrorKey =
  | 'codeMismatch'
  | 'codeExpired'
  | 'tooManyAttempts'
  | 'invalidEmail'
  | 'googleOnly'
  | 'notSignedIn'
  | 'unknown';

/** Maps Cognito / Amplify error names to message keys the UI translates. */
export function authErrorKey(e: unknown): AuthErrorKey {
  switch (errorName(e)) {
    case 'CodeMismatchException':
      return 'codeMismatch';
    case 'ExpiredCodeException':
      return 'codeExpired';
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'tooManyAttempts';
    case 'InvalidParameterException':
    case 'InvalidEmailRoleAccessPolicyException':
      return 'invalidEmail';
    case 'UserNotFoundException':
    case 'NotAuthorizedException':
      return 'googleOnly';
    case 'AutoSignInException':
    case 'SignInException':
      return 'notSignedIn';
    default:
      return 'unknown';
  }
}
