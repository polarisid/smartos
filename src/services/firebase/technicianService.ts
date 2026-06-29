import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, updateDoc, writeBatch, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Technician } from "@/lib/data";

const COLLECTION_NAME = "technicians";

export const technicianService = {
  /**
   * Obtém todos os técnicos ordenados (por enquanto, ordem padrão de chegada).
   * @returns Array de técnicos
   */
  async getAll(): Promise<Technician[]> {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const data: Technician[] = [];
    querySnapshot.forEach((docSnap) => {
      data.push({ id: docSnap.id, ...docSnap.data() } as Technician);
    });
    return data;
  },

  /**
   * Adiciona um novo técnico.
   */
  async create(technician: Omit<Technician, 'id'>, id?: string): Promise<string> {
    if (id) {
        const docRef = doc(db, COLLECTION_NAME, id);
        await setDoc(docRef, technician);
        return id;
    } else {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), technician);
        return docRef.id;
    }
  },

  /**
   * Atualiza os dados de um técnico existente.
   */
  async update(id: string, data: Partial<Technician>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, data);
  },

  /**
   * Remove um técnico do sistema.
   */
  async remove(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  },

  /**
   * Atualiza vários técnicos em lote (Batch).
   */
  async updateBatch(updates: { id: string; data: Partial<Technician> }[]): Promise<void> {
    const batch = writeBatch(db);
    updates.forEach((update) => {
      const docRef = doc(db, COLLECTION_NAME, update.id);
      batch.update(docRef, update.data);
    });
    await batch.commit();
  }
};
