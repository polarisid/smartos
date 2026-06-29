import { collection, doc, getDocs, setDoc, addDoc, deleteDoc, query, orderBy, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { type KnowledgeDocument } from "@/lib/data";

const COLLECTION_NAME = "knowledgeBase_rules";

export const knowledgeService = {
  /**
   * Obtém todos os informativos.
   */
  async getAll(): Promise<KnowledgeDocument[]> {
    const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
      } as KnowledgeDocument;
    });
  },

  /**
   * Cria um novo informativo.
   */
  async create(data: Omit<KnowledgeDocument, 'id'>): Promise<string> {
    const newDocRef = await addDoc(collection(db, COLLECTION_NAME), data);
    return newDocRef.id;
  },

  /**
   * Atualiza um informativo existente.
   */
  async update(id: string, data: Partial<KnowledgeDocument>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await setDoc(docRef, data, { merge: true });
  },

  /**
   * Exclui um informativo.
   */
  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }
};
