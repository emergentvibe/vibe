interface Settings {
  exaApiKey: string;
}

export interface DomainList {
  id: string;         // Unique identifier
  name: string;       // User-friendly name
  domains: string[];  // List of domains
  createdAt: number;  // Timestamp
  updatedAt: number;  // Timestamp
}

const DEFAULT_SETTINGS: Settings = {
  exaApiKey: '',
};

export const storage = {
  async getSettings(): Promise<Settings> {
    try {
      const result = await chrome.storage.sync.get('settings');
      return result.settings || DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Error getting settings:', error);
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: Settings): Promise<void> {
    try {
      await chrome.storage.sync.set({ settings });
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  },

  async updateApiKey(apiKey: string): Promise<void> {
    const settings = await this.getSettings();
    settings.exaApiKey = apiKey;
    await this.saveSettings(settings);
  },

  // Domain Lists CRUD operations
  async getDomainLists(): Promise<DomainList[]> {
    try {
      const result = await chrome.storage.sync.get('domainLists');
      return result.domainLists || [];
    } catch (error) {
      console.error('Error getting domain lists:', error);
      return [];
    }
  },

  async saveDomainList(list: Omit<DomainList, 'id' | 'createdAt' | 'updatedAt'>): Promise<DomainList> {
    try {
      const lists = await this.getDomainLists();
      const newList: DomainList = {
        ...list,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      await chrome.storage.sync.set({ 
        domainLists: [...lists, newList] 
      });
      
      return newList;
    } catch (error) {
      console.error('Error saving domain list:', error);
      throw error;
    }
  },

  async updateDomainList(id: string, data: Partial<Omit<DomainList, 'id' | 'createdAt'>>): Promise<DomainList | null> {
    try {
      const lists = await this.getDomainLists();
      const listIndex = lists.findIndex(list => list.id === id);
      
      if (listIndex === -1) {
        return null;
      }
      
      const updatedList: DomainList = {
        ...lists[listIndex],
        ...data,
        updatedAt: Date.now()
      };
      
      lists[listIndex] = updatedList;
      await chrome.storage.sync.set({ domainLists: lists });
      
      return updatedList;
    } catch (error) {
      console.error('Error updating domain list:', error);
      throw error;
    }
  },

  async deleteDomainList(id: string): Promise<boolean> {
    try {
      const lists = await this.getDomainLists();
      const filteredLists = lists.filter(list => list.id !== id);
      
      if (filteredLists.length === lists.length) {
        return false; // List not found
      }
      
      await chrome.storage.sync.set({ domainLists: filteredLists });
      return true;
    } catch (error) {
      console.error('Error deleting domain list:', error);
      throw error;
    }
  }
}; 