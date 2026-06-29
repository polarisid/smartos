import { supabase } from "@/lib/supabase";
import { type CodeCategory } from "@/lib/data";

export const codeService = {
  async getSymptoms(): Promise<CodeCategory | null> {
    const { data, error } = await supabase.from('codes').select('*').eq('type', 'symptom');
    if (error) throw error;
    return this.mapToCategory(data);
  },

  async getRepairs(): Promise<CodeCategory | null> {
    const { data, error } = await supabase.from('codes').select('*').eq('type', 'repair');
    if (error) throw error;
    return this.mapToCategory(data);
  },

  mapToCategory(rows: any[]): CodeCategory {
    const category: CodeCategory = { 'TV/AV': [], 'DA': [] };
    rows.forEach(row => {
      if (row.category === 'TV/AV' || row.category === 'DA') {
        category[row.category as keyof CodeCategory].push({ code: row.code, description: row.description });
      }
    });
    return category;
  },

  async create(data: { code: string; description: string; type: string; category: string }): Promise<void> {
    const { error } = await supabase.from('codes').insert(data);
    if (error) throw error;
  },

  async update(oldCode: string, type: string, category: string, data: { code: string; description: string; type: string; category: string }): Promise<void> {
    // We update by code + type + category
    const { error } = await supabase.from('codes')
        .update(data)
        .eq('code', oldCode)
        .eq('type', type)
        .eq('category', category);
    if (error) throw error;
  },

  async remove(code: string, type: string, category: string): Promise<void> {
    const { error } = await supabase.from('codes')
        .delete()
        .eq('code', code)
        .eq('type', type)
        .eq('category', category);
    if (error) throw error;
  },

  async insertMany(items: { code: string; description: string; type: string; category: string }[]): Promise<void> {
    if (items.length === 0) return;
    const { error } = await supabase.from('codes').insert(items);
    if (error) throw error;
  }
};
