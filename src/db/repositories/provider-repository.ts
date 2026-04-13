import type Database from 'better-sqlite3';
import type { ProviderConfig, ProviderType } from '../../shared/types';

export class ProviderRepository {
  private stmts: ReturnType<typeof this.prepareStatements>;

  constructor(private db: Database.Database) {
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      listAll: this.db.prepare(`SELECT * FROM provider_configs ORDER BY type`),

      update: this.db.prepare(`
        UPDATE provider_configs
        SET base_url = @baseUrl, model = @model, active = @active
        WHERE type = @type
      `),

      getActive: this.db.prepare(`
        SELECT * FROM provider_configs WHERE active = 1 LIMIT 1
      `),

      deactivateAll: this.db.prepare(`UPDATE provider_configs SET active = 0`),
      activate: this.db.prepare(`UPDATE provider_configs SET active = 1 WHERE type = @type`),
    };
  }

  listAll(): ProviderConfig[] {
    const rows = this.stmts.listAll.all() as RawProviderRow[];
    return rows.map(deserializeRow);
  }

  getActive(): ProviderConfig | null {
    const row = this.stmts.getActive.get() as RawProviderRow | undefined;
    return row ? deserializeRow(row) : null;
  }

  /** Update provider config and set it as the active provider. */
  update(config: Omit<ProviderConfig, 'label' | 'apiKey'>): void {
    const tx = this.db.transaction(() => {
      this.stmts.update.run({
        type: config.type,
        baseUrl: config.baseUrl,
        model: config.model,
        active: config.active ? 1 : 0,
      });

      if (config.active) {
        this.stmts.deactivateAll.run();
        this.stmts.activate.run({ type: config.type });
      }
    });
    tx();
  }
}

interface RawProviderRow {
  type: string;
  label: string;
  base_url: string;
  model: string;
  active: number;
}

function deserializeRow(row: RawProviderRow): ProviderConfig {
  return {
    type: row.type as ProviderType,
    label: row.label,
    baseUrl: row.base_url,
    model: row.model,
    active: row.active === 1,
  };
}
