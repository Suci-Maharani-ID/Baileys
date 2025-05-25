import { AuthenticationState } from '../Types';
export declare const useBufferedSingleFileAuthState: (file: string) => Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
}>;
