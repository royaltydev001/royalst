import { getStorage } from "firebase/storage";
import { app } from "./client";

export const fileStorage = app ? getStorage(app) : null;
