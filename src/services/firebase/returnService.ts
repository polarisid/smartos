import { collection, doc, getDocs, setDoc, addDoc, deleteDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { type Return } from "@/lib/data";

const COLLECTION_NAME = "returns";

export const returnService = {
  /**
   * Obtém todas as devoluções recentes.
   */
  async getRecentReturns(fromDate: Date): Promise<Return[]> {
    const q = query(collection(db, COLLECTION_NAME), where("returnDate", ">=", fromDate));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id, 
        ...data,
        returnDate: data.returnDate instanceof Timestamp ? data.returnDate.toDate() : data.returnDate,
      } as Return;
    });
  },

  /**
   * Obtém todas as devoluções.
   */
  async getAll(): Promise<Return[]> {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Return));
  },

  /**
   * Cria uma nova devolução.
   */
  async create(data: Omit<Return, 'id'>): Promise<string> {
    const newDocRef = await addDoc(collection(db, COLLECTION_NAME), data);
    return newDocRef.id;
  },

  /**
   * Atualiza uma devolução existente.
   */
  async update(id: string, data: Partial<Return>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await setDoc(docRef, data, { merge: true });
  },

  /**
   * Exclui uma devolução.
   */
  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }
};
