import {
  autoSignIn,
  confirmSignIn as amplifyConfirmSignIn,
  confirmSignUp as amplifyConfirmSignUp,
  fetchAuthSession,
  resendSignUpCode,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
} from 'aws-amplify/auth';

/**
 * Passwordless email one-time-code flow (Cognito USER_AUTH with EMAIL_OTP).
 * - New email: signUp without a password; Cognito emails a confirmation code; confirmSignUp + autoSignIn.
 * - Known email: signIn with preferredChallenge EMAIL_OTP; Cognito emails a code; confirmSignIn.
 */
export type CodeMode = 'signup' | 'signin';
export type SubmitOutcome = 'done' | 'code_required';

function errorName(e: unknown): string {
  return e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
}

async function startSignIn(email: string): Promise<void> {
  const { isSignedIn, nextStep } = await amplifySignIn({
    username: email,
    options: { authFlowType: 'USER_AUTH', preferredChallenge: 'EMAIL_OTP' },
  });
  if (isSignedIn) return;
  if (nextStep.signInStep !== 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE') {
    throw new Error(`Unexpected sign-in step: ${nextStep.signInStep}`);
  }
}

/** Sends a one-time code to `email` and reports whether this is a new account or an existing one. */
export async function requestCode(email: string): Promise<CodeMode> {
  try {
    await amplifySignUp({
      username: email,
      options: {
        userAttributes: { email },
        autoSignIn: { authFlowType: 'USER_AUTH', preferredChallenge: 'EMAIL_OTP' },
      },
    });
    return 'signup';
  } catch (e) {
    if (errorName(e) !== 'UsernameExistsException') throw e;
  }
  try {
    await startSignIn(email);
    return 'signin';
  } catch (e) {
    if (errorName(e) === 'UserNotConfirmedException') {
      await resendSignUpCode({ username: email });
      return 'signup';
    }
    throw e;
  }
}

export async function resendCode(email: string, mode: CodeMode): Promise<void> {
  if (mode === 'signup') await resendSignUpCode({ username: email });
  else await startSignIn(email);
}

/** Verifies the code. `code_required` means Cognito asked for one more code (now in sign-in mode). */
export async function submitCode(email: string, code: string, mode: CodeMode): Promise<SubmitOutcome> {
  if (mode === 'signup') {
    const { isSignUpComplete, nextStep } = await amplifyConfirmSignUp({ username: email, confirmationCode: code });
    if (nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
      const result = await autoSignIn();
      if (result.isSignedIn) return 'done';
      if (result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE') return 'code_required';
      throw new Error(`Unexpected sign-in step: ${result.nextStep.signInStep}`);
    }
    if (isSignUpComplete) {
      // Auto sign-in was not offered; start a regular passwordless sign-in.
      await startSignIn(email);
      return 'code_required';
    }
    throw new Error(`Unexpected sign-up step: ${nextStep.signUpStep}`);
  }
  const { isSignedIn, nextStep } = await amplifyConfirmSignIn({ challengeResponse: code });
  if (!isSignedIn) throw new Error(`Unexpected sign-in step: ${nextStep.signInStep}`);
  return 'done';
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

export async function signInWithGoogle(): Promise<void> {
  const { signInWithRedirect } = await import('aws-amplify/auth');
  await signInWithRedirect({ provider: 'Google' });
}

/** True when running inside WeChat's in-app browser, which blocks Google OAuth. */
export function isWeChatBrowser(): boolean {
  const ua = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? '';
  return /MicroMessenger/i.test(ua);
}

const FRIENDLY: Record<string, string> = {
  CodeMismatchException: 'That code is not right. Check the email and try again.',
  ExpiredCodeException: 'That code has expired. Request a new one.',
  LimitExceededException: 'Too many attempts. Wait a few minutes and try again.',
  NotAuthorizedException: 'That code is not right or the session expired. Request a new code.',
  UserNotFoundException: 'No account with that email.',
  UserNotConfirmedException: 'Please verify your email first.',
  InvalidParameterException: 'Please check the values you entered.',
  TooManyRequestsException: 'Too many requests. Try again shortly.',
  EmptyChallengeResponse: 'Enter the code from your email.',
};

export function describeAuthError(e: unknown): string {
  const name = errorName(e);
  if (name && FRIENDLY[name]) return FRIENDLY[name];
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong.';
}
