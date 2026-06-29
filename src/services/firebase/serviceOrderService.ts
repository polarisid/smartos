import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, orderBy, limit, startAfter, where, Timestamp, QueryDocumentSnapshot, DocumentData, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ServiceOrder } from "@/lib/data";

const COLLECTION_NAME = "serviceOrders";

export const serviceOrderService = {
  /**
   * Obtém Ordens de Serviço recentes a partir de uma data específica.
   */
  async getRecentOrders(startDate: Date): Promise<ServiceOrder[]> {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("date", ">=", startDate),
      orderBy("date", "desc")
    );
    const querySnapshot = await getDocs(q);
    const data: ServiceOrder[] = [];
    querySnapshot.forEach((docSnap) => {
      const docData = docSnap.data();
      data.push({
        ...docData,
        id: docSnap.id,
        date: docData.date instanceof Timestamp ? docData.date.toDate() : docData.date,
      } as ServiceOrder);
    });
    return data;
  },

  /**
   * Obtém Ordens de Serviço com suporte a paginação.
   */
  async getPaginated(pageSize: number = 20, lastDoc?: QueryDocumentSnapshot<DocumentData>): Promise<{ orders: ServiceOrder[], lastVisible: QueryDocumentSnapshot<DocumentData> | null }> {
    let q = query(
      collection(db, COLLECTION_NAME),
      orderBy("date", "desc"),
      limit(pageSize)
    );

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const querySnapshot = await getDocs(q);
    const orders: ServiceOrder[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      orders.push({
        ...data,
        id: docSnap.id,
        date: data.date instanceof Timestamp ? data.date.toDate() : data.date,
      } as ServiceOrder);
    });

    const lastVisible = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;

    return { orders, lastVisible };
  },

  /**
   * Busca Ordens de Serviço por número (prefixo).
   */
  async searchByNumber(term: string): Promise<ServiceOrder[]> {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("serviceOrderNumber", ">=", term),
      where("serviceOrderNumber", "<=", term + "\uf8ff"),
      orderBy("serviceOrderNumber"),
      limit(50)
    );
    const querySnapshot = await getDocs(q);
    const data: ServiceOrder[] = [];
    querySnapshot.forEach((docSnap) => {
      const docData = docSnap.data();
      data.push({
        ...docData,
        id: docSnap.id,
        date: docData.date instanceof Timestamp ? docData.date.toDate() : docData.date,
      } as ServiceOrder);
    });
    return data;
  },

  /**
   * Obtém uma Ordem de Serviço por ID.
   */
  async getById(id: string): Promise<ServiceOrder | null> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...data,
        id: docSnap.id,
        date: data.date instanceof Timestamp ? data.date.toDate() : data.date,
      } as ServiceOrder;
    }
    return null;
  },

  /**
   * Salva (cria ou atualiza completamente) uma Ordem de Serviço.
   */
  async set(id: string, order: Omit<ServiceOrder, 'id'>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await setDoc(docRef, order);
  },

  /**
   * Atualiza parcialmente uma Ordem de Serviço.
   */
  async update(id: string, data: Partial<ServiceOrder>): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, data);
  },

  /**
   * Remove uma Ordem de Serviço.
   */
  async remove(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
};
