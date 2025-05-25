import { AuthenticationState } from '../Types';
export declare const useSQLiteAuthState: (file: string) => Promise<{
    state: AuthenticationState;
    saveCreds: () => void;
}>;
