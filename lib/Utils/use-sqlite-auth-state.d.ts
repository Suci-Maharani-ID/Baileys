import { AuthenticationState } from '../Types';
export declare const useSQLiteAuthState: (file: string) => {
    state: AuthenticationState;
    saveCreds: () => void;
};
