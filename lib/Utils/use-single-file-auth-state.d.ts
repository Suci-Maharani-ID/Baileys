import { AuthenticationState } from '../Types';
export declare const useSingleFileAuthState: (file: string) => Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
}>;
