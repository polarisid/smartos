import { collection, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ChecklistTemplate } from "@/lib/data";

const COLLECTION_NAME = "checklistTemplates";

export const checklistService = {
  /**
   * Obtém todos os templates de checklist.
   */
  async getAll(): Promise<ChecklistTemplate[]> {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const data: ChecklistTemplate[] = [];
    querySnapshot.forEach((docSnap) => {
      data.push({ id: docSnap.id, ...docSnap.data() } as ChecklistTemplate);
    });
    return data;
  },

  /**
   * Obtém um template por ID.
   */
  async getById(id: string): Promise<ChecklistTemplate | null> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as ChecklistTemplate;
    }
    return null;
  },

  /**
   * Cria um novo template de checklist.
   */
  async create(template: Omit<ChecklistTemplate, 'id'>): Promise<string> {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), template);
    return docRef.id;
  },

  /**
   * Atualiza um template de checklist existente.
   */
  async update(id: string, data: Partial<ChecklistTemplate>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, data);
  },

  /**
   * Sobrescreve completamente um template (usado para atualizar os campos).
   */
  async set(id: string, template: Omit<ChecklistTemplate, 'id'>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await setDoc(docRef, template);
  },

  /**
   * Remove um template de checklist.
   */
  async remove(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
};
