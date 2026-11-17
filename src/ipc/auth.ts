import { z } from "zod";
import { call } from "./invoke";
import { voidSchema } from "./common";

const authStatusSchema = z.object({ username: z.string().nullable() });
export type AuthStatus = z.infer<typeof authStatusSchema>;

export const authStatus = () => call("auth_status", authStatusSchema);
export const signIn = (username: string, token: string) =>
  call("sign_in", authStatusSchema, { username, token });
export const signOut = () => call("sign_out", voidSchema);
