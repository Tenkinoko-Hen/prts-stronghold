import React, { useState } from 'react';
import { UNIVERSAL_STACKERS } from '../data/strongholdData';
import { calculateStackingProjection } from '../utils/tacticalLogic';
import { OperatorAvatar } from './OperatorAvatar';
import { Calculator, CheckCircle2, RotateCcw, Sparkles } from 'lucide-react';

export const StackingCalculatorView: React.FC = () => {
  const [activeFieldIds, setActiveFieldIds] = useState<string[]>([
    'pallas',
    'saria',
    'mon3tr',
    'amiya',
    'archetto',
  ]);
  const [activeBenchIds, setActiveBenchIds] = useState<string[]>([
    'astgenne',
    'quercus',
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
    <div className="w-full h-full overflow-y-auto bg-[#0B0E14] text-slate-100 pt-20 pb-28 px-4 sm:px-8">
      <div className="max-w-[1360px] mx-auto space-y-6">
        {/* Header & Presets */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="text-xs text-amber-400 font-medium tracking-wide">
              卫戍协议：盟约 · 叠层数学引擎与特异化模拟
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 mt-1">
              通用叠层阵型模拟器与回合收益计算器
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => applyPreset('minor-dynasty')}
              className="px-3 py-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              预设：后期帕拉斯+塞爹复制阵
            </button>
            <button
              type="button"
              onClick={() => applyPreset('iberia-price')}
              className="px-3 py-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              预设：骸骨8费售价翻倍阵
            </button>
            <button
              type="button"
              onClick={() => applyPreset('early-foresight')}
              className="px-3 py-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              预设：前中期远见渡桥空弦阵
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveFieldIds([]);
                setActiveBenchIds([]);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>清空</span>
            </button>
          </div>
        </div>

        {/* Main 12-Col Split: Left Controls (7 cols) + Right Telemetry Readout (5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Operator Selection with PRTS Avatars & Combat Parameters */}
          <div className="lg:col-span-7 space-y-6">
            {/* Field Stackers */}
            <div className="p-5 rounded-xl bg-[#0F1522] border border-slate-800 space-y-4">
              <div className="text-sm font-bold text-slate-100">
                1. 点击点亮场上部署的通用叠层干员
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {fieldCandidates.map((op) => {
                  const active = activeFieldIds.includes(op.id);
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => toggleField(op.id)}
                      className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                        active
                          ? 'bg-[#17223B] border-amber-400 text-slate-100 shadow-md'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <OperatorAvatar
                          name={op.name}
                          tier={op.tier}
                          size="sm"
                          showName={false}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-slate-100 truncate">
                            {op.name}
                          </div>
                          <div className="text-xs text-amber-300 font-semibold mt-0.5 truncate">
                            {op.tag} · {op.targetZone}
                          </div>
                        </div>
                      </div>
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${
                          active ? 'text-amber-400' : 'text-slate-700'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bench Stackers */}
            <div className="p-5 rounded-xl bg-[#0F1522] border border-slate-800 space-y-4">
              <div className="text-sm font-bold text-slate-100">
                2. 整备区后台挂机叠层干员（不占场上人口）
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {benchCandidates.map((op) => {
                  const active = activeBenchIds.includes(op.id);
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => toggleBench(op.id)}
                      className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                        active
                          ? 'bg-[#132838] border-sky-400 text-slate-100 shadow-md'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <OperatorAvatar
                          name={op.name}
                          tier={op.tier}
                          size="sm"
                          showName={false}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-slate-100 truncate">
                            {op.name}
                          </div>
                          <div className="text-xs text-sky-300 font-semibold mt-0.5 truncate">
                            {op.tag}
                          </div>
                        </div>
                      </div>
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${
                          active ? 'text-sky-400' : 'text-slate-700'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sliders for Combat Triggers & Rounds */}
            <div className="p-5 rounded-xl bg-[#0F1522] border border-slate-800 space-y-4">
              <div className="text-sm font-bold text-slate-100">
                3. 调节局内战斗叠层频率与回合数
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">每回合战斗触发次数（杀砾/冻结/开技能）</span>
                    <span className="font-mono-tabular text-amber-400 font-bold">
                      {combatTriggerCount} 次/回合
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={combatTriggerCount}
                    onChange={(e) => setCombatTriggerCount(Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </label>

                <label className="block space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">单次触发基础层数</span>
                    <span className="font-mono-tabular text-amber-400 font-bold">
                      +{baseStacksPerTrigger} 层/次
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    value={baseStacksPerTrigger}
                    onChange={(e) => setBaseStacksPerTrigger(Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </label>

                <label className="block space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">骸骨身前干员售出价格（流明=6，满絮雨=8）</span>
                    <span className="font-mono-tabular text-amber-400 font-bold">
                      {frontTargetSellPrice} 资金
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={frontTargetSellPrice}
                    onChange={(e) => setFrontTargetSellPrice(Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </label>

                <label className="block space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">连续运营回合数</span>
                    <span className="font-mono-tabular text-amber-400 font-bold">
                      {rounds} 回合
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={15}
                    value={rounds}
                    onChange={(e) => setRounds(Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Right: Live Projection & Breakdown */}
          <div className="lg:col-span-5 space-y-5">
            <div className="p-6 rounded-xl bg-[#0F1522] border border-slate-800 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-bold text-slate-100">
                    叠层收益实时测算结果
                  </h2>
                </div>
                <span className="text-xs font-mono-tabular text-slate-400">
                  {rounds} 回合累计
                </span>
              </div>

              {/* Primary KPI Numbers */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400">单回合总增长层数</div>
                  <div
                    data-testid="stacks-per-round"
                    className="text-2xl sm:text-3xl font-bold font-mono-tabular text-amber-400 mt-1"
                  >
                    +{projection.totalStacksPerRound}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    休整期 +{projection.restPhaseStacksPerRound} · 战斗 +{projection.combatStacksPerRound}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400">
                    {rounds} 回合预计总层数
                  </div>
                  <div
                    data-testid="projected-total-stacks"
                    className="text-2xl sm:text-3xl font-bold font-mono-tabular text-emerald-400 mt-1"
                  >
                    {projection.projectedTotalStacks} 层
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    战斗叠层上限：{projection.effectiveCombatCap} 层/场
                  </div>
                </div>
              </div>

              {/* Foresight & Milestone Thresholds */}
              <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>关键盟约质变节点达成预测</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">【远见 80层】远见干员购买价格永久-2</span>
                    <span
                      className={
                        projection.foresight80Unlocked
                          ? 'text-emerald-400 font-semibold'
                          : 'text-slate-500'
                      }
                    >
                      {projection.foresight80Unlocked ? '已达成' : '未达成'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">【远见 190层】购买装备价格额外永久-1</span>
                    <span
                      className={
                        projection.foresight190Unlocked
                          ? 'text-emerald-400 font-semibold'
                          : 'text-slate-500'
                      }
                    >
                      {projection.foresight190Unlocked ? '已达成' : '未达成'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">【终极 500层+】稳过15回合终极/隐藏Boss线</span>
                    <span
                      className={
                        projection.projectedTotalStacks >= 500
                          ? 'text-amber-400 font-semibold'
                          : 'text-slate-500'
                      }
                    >
                      {projection.projectedTotalStacks >= 500 ? '稳过终极' : '继续叠层'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown List */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-400">
                  单回合叠层来源明细
                </div>
                <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-lg bg-slate-900/50">
                  {projection.breakdown.map((item) => (
                    <div
                      key={item.label}
                      className="px-3.5 py-2.5 flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-300">{item.label}</span>
                      <span className="font-mono-tabular font-semibold text-amber-400">
                        +{item.value} 层
                      </span>
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
