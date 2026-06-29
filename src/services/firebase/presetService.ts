import { collection, doc, getDocs, setDoc, addDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { type Preset } from "@/lib/data";

const COLLECTION_NAME = "presets";

export const presetService = {
  /**
   * Obtém todos os presets.
   */
  async getAll(): Promise<Preset[]> {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Preset));
  },

  /**
   * Cria um novo preset.
   */
  async create(data: Omit<Preset, 'id'>): Promise<string> {
    const newDocRef = await addDoc(collection(db, COLLECTION_NAME), data);
    return newDocRef.id;
  },

  /**
   * Atualiza um preset existente.
   */
  async update(id: string, data: Partial<Preset>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await setDoc(docRef, data, { merge: true });
  },

  /**
   * Exclui um preset.
   */
  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }
};
