import { collection, doc, getDocs, setDoc, addDoc, deleteDoc, query, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { type TriageSession } from "@/lib/data";

const COLLECTION_NAME = "triages";

export const triageService = {
  /**
   * Obtém todas as sessões de triagem ordenadas pela última atualização.
   */
  async getAll(): Promise<TriageSession[]> {
    const q = query(collection(db, COLLECTION_NAME), orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt,
        messages: data.messages?.map((msg: any) => ({
            ...msg,
            createdAt: msg.createdAt instanceof Timestamp ? msg.createdAt.toDate() : msg.createdAt
        })) || []
      } as TriageSession;
    });
  },

  /**
   * Cria uma nova sessão de triagem.
   */
  async create(data: Omit<TriageSession, 'id'>): Promise<string> {
    const newDocRef = await addDoc(collection(db, COLLECTION_NAME), data);
    return newDocRef.id;
  },

  /**
   * Atualiza uma sessão de triagem existente.
   */
  async update(id: string, data: Partial<TriageSession>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await setDoc(docRef, data, { merge: true });
  },

  /**
   * Exclui uma sessão de triagem.
   */
  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }
};
