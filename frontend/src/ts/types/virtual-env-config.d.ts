export type EnvConfig = {
  backendUrl: string;
  isDevelopment: boolean;
  clientVersion: string;
  recaptchaSiteKey: string;
  firebaseAuthEmulatorUrl: string | undefined;
  captchaBypassEnabled: boolean;
  quickLoginEmail: string | undefined;
  quickLoginPassword: string | undefined;
};

declare module "virtual:env-config" {
  export const envConfig: EnvConfig;
}
