import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

// Biometrics are NOT a way of signing in. Face ID doesn't prove who you are to
// Supabase -- it unlocks a session this device already holds. So this is a lock
// over the top of an existing session: sign in once with a code, then Face ID
// (or a fingerprint) to get back in, which is the "quick to get to what you
// need" part. Signing out still requires a real sign-in next time.

const ENABLED_KEY = 'snacktrack.biometric_lock_enabled';

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'none';

/** What the device can actually do. Web has no equivalent, so it reports none. */
export async function getBiometricKind(): Promise<BiometricKind> {
  if (Platform.OS === 'web') return 'none';
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  // Hardware without enrollment is useless to us -- the prompt would just fail,
  // so treat "has a sensor but no face/finger registered" as unavailable.
  if (!hasHardware || !isEnrolled) return 'none';

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'iris';
  return 'none';
}

export function biometricLabel(kind: BiometricKind): string {
  switch (kind) {
    case 'face':
      return Platform.OS === 'ios' ? 'Face ID' : 'face unlock';
    case 'fingerprint':
      return Platform.OS === 'ios' ? 'Touch ID' : 'fingerprint';
    case 'iris':
      return 'iris unlock';
    default:
      return 'biometric unlock';
  }
}

export async function isBiometricLockEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
}

/**
 * Prompt for the device biometric. Device passcode fallback stays ON: locking
 * someone out of their own food log because Face ID misread them in bad light
 * would be its own kind of judgement.
 */
export async function promptBiometric(kind: BiometricKind): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: `Unlock SNACK TRACK with ${biometricLabel(kind)}`,
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use passcode',
  });
  return result.success;
}
