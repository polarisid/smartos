import { collection, doc, getDocs, setDoc, addDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { type Indicator } from "@/lib/data";

const COLLECTION_NAME = "indicators";

export const indicatorService = {
  /**
   * Obtém todos os indicadores.
   */
  async getAll(): Promise<Indicator[]> {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Indicator));
  },

  /**
   * Cria um novo indicador.
   */
  async create(data: Omit<Indicator, 'id'>): Promise<string> {
    const newDocRef = await addDoc(collection(db, COLLECTION_NAME), data);
    return newDocRef.id;
  },

  /**
   * Atualiza um indicador existente.
   */
  async update(id: string, data: Partial<Indicator>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await setDoc(docRef, data, { merge: true });
  },

  /**
   * Exclui um indicador.
   */
  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }
};
