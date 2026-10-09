import { getFirestore } from "firebase/firestore";
import { app } from "./client";

export const database = app ? getFirestore(app) : null;
