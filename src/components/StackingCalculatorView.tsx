import React, { useState } from 'react';
import { UNIVERSAL_STACKERS } from '../data/strongholdData';
import { PEPE_POSITION_IMAGE } from '../data/ngaCommunityComps';
import { calculateStackingProjection } from '../utils/tacticalLogic';
import { OperatorAvatar } from './OperatorAvatar';
import { Calculator, CheckCircle2, Eye, RotateCcw, Sparkles } from 'lucide-react';

export const StackingCalculatorView: React.FC<{ onOpenImage(url: string, title: string): void }> = ({ onOpenImage }) => {
  const [activeFieldIds, setActiveFieldIds] = useState<string[]>([
    'pallas', 'saria', 'mon3tr', 'amiya', 'archetto',
  ]);
  const [activeBenchIds, setActiveBenchIds] = useState<string[]>([
    'astgenne', 'quercus',
  ]);
  const [frontTargetSellPrice, setFrontTargetSellPrice] = useState<number>(6);
  const [combatTriggerCount, setCombatTriggerCount] = useState<number>(8);
  const [baseStacksPerTrigger, setBaseStacksPerTrigger] = useState<number>(2);
  const [baseCombatCap, setBaseCombatCap] = useState<number>(24);
  const [rounds, setRounds] = useState<number>(6);

  const toggleField = (id: string) => {
    setActiveFieldIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleBench = (id: string) => {
    setActiveBenchIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const applyPreset = (preset: 'minor-dynasty' | 'iberia-price' | 'early-foresight') => {
    if (preset === 'minor-dynasty') {
      setActiveFieldIds(['pallas', 'saria', 'civilight-eterna', 'mon3tr', 'amiya', 'warfarin']);
      setActiveBenchIds(['astgenne', 'quercus']);
      setFrontTargetSellPrice(6);
      setCombatTriggerCount(10);
      setBaseStacksPerTrigger(2);
      setBaseCombatCap(24);
      setRounds(6);
    } else if (preset === 'iberia-price') {
      setActiveFieldIds(['haigu', 'saria', 'archetto', 'poncirus']);
      setActiveBenchIds(['astgenne', 'quercus']);
      setFrontTargetSellPrice(8);
      setCombatTriggerCount(6);
      setBaseStacksPerTrigger(2);
      setBaseCombatCap(16);
      setRounds(6);
    } else {
      setActiveFieldIds(['windscoot', 'archetto', 'poncirus']);
      setActiveBenchIds(['astgenne', 'quercus']);
      setFrontTargetSellPrice(4);
      setCombatTriggerCount(6);
      setBaseStacksPerTrigger(2);
      setBaseCombatCap(16);
      setRounds(5);
    }
  };

  const projection = calculateStackingProjection({
    activeFieldIds,
    activeBenchIds,
    frontTargetSellPrice,
    combatTriggerCount,
    baseStacksPerTrigger,
    baseCombatCap,
    rounds,
  });

  const fieldCandidates = UNIVERSAL_STACKERS.filter((s) => !s.worksOnBench);
  const benchCandidates = UNIVERSAL_STACKERS.filter((s) => s.worksOnBench);

  return (
    <div className="d-ref-scroll">
      <div className="d-ref-inner">
        {/* 1. Compact Presets Bar */}
        <div className="d-ind-bar d-panel">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-extrabold text-[#f3f4f6]">
              叠层收益模拟器 <small className="font-mono-tabular text-[#9ca3af] font-normal ml-1">STACK ENGINE</small>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className="d-button d-small" onClick={() => onOpenImage(PEPE_POSITION_IMAGE, '佩佩四合院 · 站位')}>
              <Eye size={12} />佩佩四合院站位
            </button>
            <button type="button" className="d-button d-small" onClick={() => applyPreset('minor-dynasty')}>
              预设：帕拉斯+塞爹复制阵
            </button>
            <button type="button" className="d-button d-small" onClick={() => applyPreset('iberia-price')}>
              预设：骸骨 8 费翻倍阵
            </button>
            <button type="button" className="d-button d-small" onClick={() => applyPreset('early-foresight')}>
              预设：前中期远见渡桥阵
            </button>
            <button
              type="button"
              onClick={() => { setActiveFieldIds([]); setActiveBenchIds([]); }}
              className="d-button d-small"
            >
              <RotateCcw size={12} />清空
            </button>
          </div>
        </div>

        {/* 2. Main 12-Col Industrial Workbench */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
          {/* Left 7 cols: Controls */}
          <div className="lg:col-span-7 space-y-3">
            <div className="d-panel p-3.5 space-y-2.5">
              <div className="text-xs font-extrabold tracking-wide text-[#ffe600]">
                01 // 场上部署通用叠层干员
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {fieldCandidates.map((op) => {
                  const active = activeFieldIds.includes(op.id);
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => toggleField(op.id)}
                      className={`d-ind-card p-2.5 text-left flex items-center justify-between gap-2.5${active ? ' is-accent' : ''}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <OperatorAvatar name={op.name} tier={op.tier} size="sm" showName={false} />
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-[#f3f4f6] truncate">{op.name}</div>
                          <div className="text-[11px] text-[#ffe600] font-semibold mt-0.5 truncate">
                            {op.tag} · {op.targetZone}
                          </div>
                        </div>
                      </div>
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${active ? 'text-[#ffe600]' : 'text-[#4b5563]'}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="d-panel p-3.5 space-y-2.5">
              <div className="text-xs font-extrabold tracking-wide text-[#00e5ff]">
                02 // 整备区后台挂机叠层干员（不占人口）
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {benchCandidates.map((op) => {
                  const active = activeBenchIds.includes(op.id);
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => toggleBench(op.id)}
                      className={`d-ind-card p-2.5 text-left flex items-center justify-between gap-2.5${active ? ' is-cyan' : ''}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <OperatorAvatar name={op.name} tier={op.tier} size="sm" showName={false} />
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-[#f3f4f6] truncate">{op.name}</div>
                          <div className="text-[11px] text-[#00e5ff] font-semibold mt-0.5 truncate">{op.tag}</div>
                        </div>
                      </div>
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${active ? 'text-[#00e5ff]' : 'text-[#4b5563]'}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="d-panel p-3.5 space-y-3">
              <div className="text-xs font-extrabold tracking-wide text-[#9ca3af]">
                03 // 局内触发频率与回合数调节
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#d1d5db]">每回合战斗触发次数</span>
                    <span className="font-mono-tabular text-[#ffe600] font-bold">{combatTriggerCount} 次/回合</span>
                  </div>
                  <input type="range" min={0} max={20} value={combatTriggerCount}
                    onChange={(e) => setCombatTriggerCount(Number(e.target.value))} className="w-full accent-[#ffe600]" />
                </label>

                <label className="block space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#d1d5db]">单次触发基础层数</span>
                    <span className="font-mono-tabular text-[#ffe600] font-bold">+{baseStacksPerTrigger} 层/次</span>
                  </div>
                  <input type="range" min={1} max={8} value={baseStacksPerTrigger}
                    onChange={(e) => setBaseStacksPerTrigger(Number(e.target.value))} className="w-full accent-[#ffe600]" />
                </label>

                <label className="block space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#d1d5db]">骸骨身前售出价（流明6 / 絮雨8）</span>
                    <span className="font-mono-tabular text-[#ffe600] font-bold">{frontTargetSellPrice} 资金</span>
                  </div>
                  <input type="range" min={1} max={10} value={frontTargetSellPrice}
                    onChange={(e) => setFrontTargetSellPrice(Number(e.target.value))} className="w-full accent-[#ffe600]" />
                </label>

                <label className="block space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#d1d5db]">连续运营回合数</span>
                    <span className="font-mono-tabular text-[#ffe600] font-bold">{rounds} 回合</span>
                  </div>
                  <input type="range" min={1} max={15} value={rounds}
                    onChange={(e) => setRounds(Number(e.target.value))} className="w-full accent-[#ffe600]" />
                </label>
              </div>
            </div>
          </div>

          {/* Right 5 cols: Industrial Telemetry Readout */}
          <div className="lg:col-span-5">
            <div className="d-panel prts-reticle p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-[#ffffff1a] pb-3">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-[#ffe600]" />
                  <h2 className="text-sm font-extrabold text-[#f3f4f6]">叠层收益实时测算</h2>
                </div>
                <span className="text-xs font-mono-tabular text-[#00e5ff]">{rounds} ROUNDS</span>
              </div>

              <div className="hazard-stripe" aria-hidden="true" />

              <div className="grid grid-cols-2 gap-2.5">
                <div className="d-ind-kpi">
                  <div className="text-[11px] text-[#9ca3af]">单回合总增长</div>
                  <div data-testid="stacks-per-round" className="text-2xl font-extrabold font-mono-tabular text-[#ffe600] mt-1">
                    +{projection.totalStacksPerRound}
                  </div>
                  <div className="text-[11px] text-[#9ca3af] mt-1">
                    休整 +{projection.restPhaseStacksPerRound} · 战斗 +{projection.combatStacksPerRound}
                  </div>
                </div>

                <div className="d-ind-kpi">
                  <div className="text-[11px] text-[#9ca3af]">{rounds} 回合预计总层数</div>
                  <div data-testid="projected-total-stacks" className="text-2xl font-extrabold font-mono-tabular text-[#00e5ff] mt-1">
                    {projection.projectedTotalStacks} 层
                  </div>
                  <div className="text-[11px] text-[#9ca3af] mt-1">
                    单场上限 {projection.effectiveCombatCap} 层
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[#0b0c0e] border border-[#ffffff14] space-y-2">
                <div className="text-xs font-bold text-[#f3f4f6] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#ffe600]" />
                  <span>关键质变节点</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#9ca3af]">远见 80 层（干员价 -2）</span>
                    <span className={projection.foresight80Unlocked ? 'text-[#34d399] font-bold' : 'text-[#6b7280]'}>
                      {projection.foresight80Unlocked ? '已达成' : '未达成'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#9ca3af]">远见 190 层（装备价 -1）</span>
                    <span className={projection.foresight190Unlocked ? 'text-[#34d399] font-bold' : 'text-[#6b7280]'}>
                      {projection.foresight190Unlocked ? '已达成' : '未达成'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#9ca3af]">终极 500 层+（R15 隐藏线）</span>
                    <span className={projection.projectedTotalStacks >= 500 ? 'text-[#ffe600] font-bold' : 'text-[#6b7280]'}>
                      {projection.projectedTotalStacks >= 500 ? '稳过终极' : '继续叠层'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-[#9ca3af]">单回合叠层来源明细</div>
                <div className="divide-y divide-[#ffffff12] border border-[#ffffff14] bg-[#0b0c0e]">
                  {projection.breakdown.map((item) => (
                    <div key={item.label} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-[#d1d5db]">{item.label}</span>
                      <span className="font-mono-tabular font-bold text-[#ffe600]">+{item.value} 层</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
