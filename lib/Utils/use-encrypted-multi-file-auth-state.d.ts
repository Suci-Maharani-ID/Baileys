import { AuthenticationState } from '../Types';
export declare const useEncryptedMultiFileAuthState: (folder: string) => Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
}>;
