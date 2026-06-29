import { collection, doc, getDocs, setDoc, addDoc, deleteDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { type Chargeback } from "@/lib/data";

const COLLECTION_NAME = "chargebacks";

export const chargebackService = {
  /**
   * Obtém todos os chargebacks recentes.
   */
  async getRecentChargebacks(fromDate: Date): Promise<Chargeback[]> {
    const q = query(collection(db, COLLECTION_NAME), where("date", ">=", fromDate));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id, 
        ...data,
        date: data.date instanceof Timestamp ? data.date.toDate() : data.date,
      } as Chargeback;
    });
  },

  /**
   * Obtém todos os chargebacks.
   */
  async getAll(): Promise<Chargeback[]> {
    const snapshot = await getDocs(collection(db, COLLECTION_NAME));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Chargeback));
  },

  /**
   * Cria um novo chargeback.
   */
  async create(data: Omit<Chargeback, 'id'>): Promise<string> {
    const newDocRef = await addDoc(collection(db, COLLECTION_NAME), data);
    return newDocRef.id;
  },

  /**
   * Atualiza um chargeback existente.
   */
  async update(id: string, data: Partial<Chargeback>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await setDoc(docRef, data, { merge: true });
  },

  /**
   * Exclui um chargeback.
   */
  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }
};
