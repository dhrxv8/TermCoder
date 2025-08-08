import keytar from "keytar";
import { ProviderId } from "../providers/types.js";

const SERVICE_NAME = "termcode";

export class KeyStore {
  static async setProviderKey(provider: ProviderId, key: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, `provider:${provider}`, key);
  }

  static async getProviderKey(provider: ProviderId): Promise<string | null> {
    return await keytar.getPassword(SERVICE_NAME, `provider:${provider}`);
  }

  static async deleteProviderKey(provider: ProviderId): Promise<boolean> {
    return await keytar.deletePassword(SERVICE_NAME, `provider:${provider}`);
  }

  static async listProviderKeys(): Promise<ProviderId[]> {
    try {
      const credentials = await keytar.findCredentials(SERVICE_NAME);
      const providers: ProviderId[] = [];
      
      for (const cred of credentials) {
        if (cred.account.startsWith("provider:")) {
          const provider = cred.account.replace("provider:", "") as ProviderId;
          providers.push(provider);
        }
      }
      
      return providers;
    } catch (error) {
      return [];
    }
  }

  static async hasProviderKey(provider: ProviderId): Promise<boolean> {
    const key = await KeyStore.getProviderKey(provider);
    return key !== null && key.trim() !== "";
  }

  static async clearAllKeys(): Promise<void> {
    try {
      const credentials = await keytar.findCredentials(SERVICE_NAME);
      for (const cred of credentials) {
        await keytar.deletePassword(SERVICE_NAME, cred.account);
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}