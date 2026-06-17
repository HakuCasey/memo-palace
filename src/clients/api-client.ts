import type {
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  EvolutionTask,
  SearchResult,
  ServerStatus,
  CreateEpisodicInput,
  UpdateEpisodicInput,
  CreateSemanticInput,
  UpdateSemanticInput,
  CreateProceduralInput,
  UpdateProceduralInput,
} from '../server/types.js';

type EpisodicFilters = {
  status?: string;
  source?: string;
  episodic_type?: string;
  page?: number;
  limit?: number;
};

type SemanticFilters = {
  category?: string;
  semantic_type?: string;
  page?: number;
  limit?: number;
};

type ProceduralFilters = {
  procedural_type?: 'skill' | 'workflow';
  page?: number;
  limit?: number;
};

type SearchOptions = {
  layer?: 'episodic' | 'semantic';
  limit?: number;
  episodic_type?: string;
  semantic_type?: string;
};

export class MemoPalaceClient {
  private baseUrl: string;
  private clientId: string | null = null;
  private userAgent: string;

  constructor(baseUrl: string = 'http://localhost:5678', userAgent: string = 'memopalace-client/0.1.0') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.userAgent = userAgent;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { 'User-Agent': this.userAgent };
    if (this.clientId) headers['X-Client-ID'] = this.clientId;

    const options: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const serverClientId = res.headers.get('X-Client-ID');
    if (serverClientId) this.clientId = serverClientId;

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data as T;
  }

  private buildQuery(params: { [key: string]: string | number | undefined }): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }
    return parts.length > 0 ? `?${parts.join('&')}` : '';
  }

  async createEpisodic(input: CreateEpisodicInput): Promise<EpisodicMemory> {
    return this.request<EpisodicMemory>('POST', '/api/episodic', input);
  }

  async updateEpisodic(id: string, update: UpdateEpisodicInput): Promise<EpisodicMemory> {
    return this.request<EpisodicMemory>('PATCH', `/api/episodic/${id}`, update);
  }

  async listEpisodic(filters?: EpisodicFilters): Promise<EpisodicMemory[]> {
    const query = filters ? this.buildQuery(filters) : '';
    return this.request<EpisodicMemory[]>('GET', `/api/episodic${query}`);
  }

  async getEpisodic(id: string): Promise<EpisodicMemory> {
    return this.request<EpisodicMemory>('GET', `/api/episodic/${id}`);
  }

  async createSemantic(input: CreateSemanticInput): Promise<SemanticMemory> {
    return this.request<SemanticMemory>('POST', '/api/semantic', input);
  }

  async updateSemantic(id: string, update: UpdateSemanticInput): Promise<SemanticMemory> {
    return this.request<SemanticMemory>('PATCH', `/api/semantic/${id}`, update);
  }

  async listSemantic(filters?: SemanticFilters): Promise<SemanticMemory[]> {
    const query = filters ? this.buildQuery(filters) : '';
    return this.request<SemanticMemory[]>('GET', `/api/semantic${query}`);
  }

  async getSemantic(id: string): Promise<SemanticMemory> {
    return this.request<SemanticMemory>('GET', `/api/semantic/${id}`);
  }

  async createProcedural(input: CreateProceduralInput): Promise<ProceduralMemory> {
    return this.request<ProceduralMemory>('POST', '/api/procedural', input);
  }

  async updateProcedural(id: string, update: UpdateProceduralInput): Promise<ProceduralMemory> {
    return this.request<ProceduralMemory>('PATCH', `/api/procedural/${id}`, update);
  }

  async listProcedural(filters?: ProceduralFilters): Promise<ProceduralMemory[]> {
    const query = filters ? this.buildQuery(filters) : '';
    return this.request<ProceduralMemory[]>('GET', `/api/procedural${query}`);
  }

  async getProcedural(id: string): Promise<ProceduralMemory> {
    return this.request<ProceduralMemory>('GET', `/api/procedural/${id}`);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    return this.request<SearchResult>('POST', '/api/search', { query, ...options });
  }

  async getStatus(): Promise<ServerStatus> {
    return this.request<ServerStatus>('GET', '/api/status');
  }

  async selfCheck(): Promise<{ connectivity: string; memory_stats: { episodic: number; semantic: number; procedural: number }; db_health: string }> {
    return this.request('GET', '/api/self-check');
  }

  async importData(data: object[]): Promise<{ imported: number }> {
    return this.request('POST', '/api/import', data);
  }

  async analyze(): Promise<{ new_tasks: number }> {
    return this.request('POST', '/api/evolution/analyze');
  }

  async listEvolutionTasks(): Promise<EvolutionTask[]> {
    return this.request<EvolutionTask[]>('GET', '/api/evolution/tasks');
  }

  async confirmTask(id: string): Promise<EvolutionTask> {
    return this.request<EvolutionTask>('POST', `/api/evolution/tasks/${id}/confirm`);
  }

  async rejectTask(id: string): Promise<EvolutionTask> {
    return this.request<EvolutionTask>('POST', `/api/evolution/tasks/${id}/reject`);
  }

  async getEvolutionHistory(): Promise<EvolutionTask[]> {
    return this.request<EvolutionTask[]>('GET', '/api/evolution/history');
  }
}
