import sys

file_path = r'd:\Projetos - DEV\smartos\src\app\admin\planejamento\page.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Block 0_1
t0_1 = "const [optimizeViewTab, setOptimizeViewTab] = useState<'list' | 'map'>('list');"
r0_1 = "const [optimizeViewTab, setOptimizeViewTab] = useState<'list' | 'map' | 'hybrid'>('list');"
content = content.replace(t0_1, r0_1)

# Block 0_2
t0_2 = """                <button
                  type="button"
                  onClick={() => setOptimizeViewTab('list')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all",
                    optimizeViewTab === 'list'
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="h-3.5 w-3.5" /> 📋 Comparativo em Lista & Editar Turnos
                </button>
              </div>

              <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                {optimizeViewTab === 'map' ? 'Vermelho = Ordem Atual · Verde = Otimizado por CEP/Geolocalização' : 'Organize posições e defina os turnos'}
              </span>"""
r0_2 = """                <button
                  type="button"
                  onClick={() => setOptimizeViewTab('list')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all",
                    optimizeViewTab === 'list'
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="h-3.5 w-3.5" /> 📋 Comparativo em Lista
                </button>
                <button
                  type="button"
                  onClick={() => setOptimizeViewTab('hybrid')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all",
                    optimizeViewTab === 'hybrid'
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="h-3.5 w-3.5" /> + <MapPin className="h-3.5 w-3.5" /> Mapa & Edição Manual
                </button>
              </div>

              <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                {optimizeViewTab === 'map' ? 'Vermelho = Ordem Atual · Verde = Otimizado' : 'Organize posições e defina os turnos'}
              </span>"""
content = content.replace(t0_2, r0_2)

# Block 1
t1 = """            {optimizeViewTab === 'map' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[560px]">
                {/* Mapa Antes (Ordem Atual) */}"""
r1 = """            <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4", optimizeViewTab !== 'list' ? "h-[560px]" : "")}>
              {/* Mapa Antes (Ordem Atual) */}
              {optimizeViewTab === 'map' && (
"""
content = content.replace(t1, r1)

# Block 2
t2 = """                </div>

                {/* Mapa Depois (Sugerido pela IA) */}
                <div className="flex flex-col border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-3 bg-emerald-50/20 dark:bg-emerald-955/10 h-full">
                  <div className="flex items-center justify-between mb-2 shrink-0">"""
r2 = """                </div>
              )}

              {/* Mapa Depois (Sugerido pela IA) */}
              {(optimizeViewTab === 'map' || optimizeViewTab === 'hybrid') && (
                <div className={cn("flex flex-col border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-3 bg-emerald-50/20 dark:bg-emerald-955/10", optimizeViewTab !== 'list' ? "h-full" : "")}>
                  <div className="flex items-center justify-between mb-2 shrink-0">"""
content = content.replace(t2, r2)

# Block 3
t3 = """                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Ordem Atual */}
                {(() => {"""
r3 = """                  </div>
                </div>
              )}

              {/* Ordem Atual */}
              {optimizeViewTab === 'list' && (() => {"""
content = content.replace(t3, r3)

# Block 4
t4 = """                      </div>
                    </div>
                  );
                })()}

                {/* Ordem Sugerida pela IA */}
                {(() => {"""
r4 = """                      </div>
                    </div>
                  );
                })()}

              {/* Ordem Sugerida pela IA */}
              {(optimizeViewTab === 'list' || optimizeViewTab === 'hybrid') && (() => {"""
content = content.replace(t4, r4)

# Block 5
t5 = """                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>"""
r5 = """                      </div>
                    </div>
                  );
                })()}
            </div>
          </div>"""
content = content.replace(t5, r5)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
