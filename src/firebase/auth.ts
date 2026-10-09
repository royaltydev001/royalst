import { getAuth } from "firebase/auth";
import { app } from "./client";

export const auth = app ? getAuth(app) : null;
