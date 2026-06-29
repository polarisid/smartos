import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { type CodeCategory } from "@/lib/data";

const COLLECTION_NAME = "codes";

export const codeService = {
  /**
   * Obtém os códigos de sintomas.
   */
  async getSymptoms(): Promise<CodeCategory | null> {
    const docSnap = await getDoc(doc(db, COLLECTION_NAME, "symptoms"));
    return docSnap.exists() ? docSnap.data() as CodeCategory : null;
  },
  
  /**
   * Obtém os códigos de reparos.
   */
  async getRepairs(): Promise<CodeCategory | null> {
    const docSnap = await getDoc(doc(db, COLLECTION_NAME, "repairs"));
    return docSnap.exists() ? docSnap.data() as CodeCategory : null;
  },

  /**
   * Salva/Atualiza os códigos de sintomas.
   */
  async setSymptoms(data: CodeCategory): Promise<void> {
    await setDoc(doc(db, COLLECTION_NAME, "symptoms"), data);
  },

  /**
   * Salva/Atualiza os códigos de reparos.
   */
  async setRepairs(data: CodeCategory): Promise<void> {
    await setDoc(doc(db, COLLECTION_NAME, "repairs"), data);
  }
};
