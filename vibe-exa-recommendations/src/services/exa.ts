import Exa from 'exa-js';
import { storage, DomainList } from './storage';

export interface SimilarResult {
  title: string | null;
  url: string;
  id: string;
  score?: number;
  publishedDate?: string;
  author?: string | null;
}

interface ExaResponse {
  results: SimilarResult[];
  autopromptString?: string;
}

export interface SearchOptions {
  sameDomain?: boolean;
  domainListId?: string;
}

class ExaService {
  private exa: Exa | null = null;
  private static instance: ExaService;

  private constructor() {
    this.initializeExa();
  }

  private async initializeExa() {
    const settings = await storage.getSettings();
    if (settings.exaApiKey) {
      this.exa = new Exa(settings.exaApiKey);
    }
  }

  public static getInstance(): ExaService {
    if (!ExaService.instance) {
      ExaService.instance = new ExaService();
    }
    return ExaService.instance;
  }

  public async findSimilarPages(currentUrl: string, options: SearchOptions = {}): Promise<SimilarResult[]> {
    try {
      // Ensure we have the latest API key
      await this.initializeExa();

      if (!this.exa) {
        console.error('Exa API key not configured');
        return [];
      }
      
      // Set up search options
      let searchOptions: any = {
        numResults: 10,
        excludeSourceDomain: !options.sameDomain
      };
      
      // Handle same domain option
      if (options.sameDomain) {
        try {
          const domain = new URL(currentUrl).hostname;
          searchOptions.includeDomains = [domain];
        } catch (error) {
          console.error('Error extracting domain from URL:', error);
        }
      }
      // Handle domain list option
      else if (options.domainListId) {
        const domainLists = await storage.getDomainLists();
        const selectedList = domainLists.find(list => list.id === options.domainListId);
        
        if (selectedList && selectedList.domains.length > 0) {
          searchOptions.includeDomains = selectedList.domains;
          // Don't exclude source domain if it's in the list
          searchOptions.excludeSourceDomain = false;
        } else {
          console.error('Domain list not found or empty:', options.domainListId);
        }
      }

      const response = await this.exa.findSimilar(
        currentUrl,
        searchOptions
      ) as ExaResponse;

      return response.results;
    } catch (error) {
      console.error('Error finding similar pages:', error);
      return [];
    }
  }
}

export const exaService = ExaService.getInstance(); 