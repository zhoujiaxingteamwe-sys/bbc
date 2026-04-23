import {useState, useEffect, useCallback, useRef} from 'react';
import DodoFarm from './assets/dodo-farm.svg?react';
import c from './index.less';

// ─── Types ───────────────────────────────────────────────────────────────────

type LandType = '普通' | '红土地' | '黑土地' | '金土地';

interface CropRecord {
    id: number;
    name: string;
    totalSec: number;        // 精确总秒数
    actualHours: number;     // 显示用，实际小时（含小数）
    landType: LandType;
    plantTime: string;       // ISO
    harvestTime: string;     // ISO
    status: '待收获' | '已收获';
    harvestedAt?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LAND_DISCOUNT: Record<LandType, number> = {
    '普通': 0.0,
    '红土地': 0.0,
    '黑土地': 0.10,
    '金土地': 0.20,
};

const LAND_CONFIG: Record<LandType, {label: string; desc: string; tagColor: string}> = {
    '普通':    { label: '普通',    desc: '标准成熟时间',          tagColor: '#a0a0a0' },
    '红土地':  { label: '红土地',  desc: '不减时·稀有土地',        tagColor: '#c0392b' },
    '黑土地':  { label: '黑土地',  desc: '减少 10% 成熟时间',      tagColor: '#2c2c2c' },
    '金土地':  { label: '金土地',  desc: '减少 20% 成熟时间·最速', tagColor: '#d4a017' },
};

// 滚轮选项
const HOUR_OPTS  = Array.from({length: 25}, (_, i) => ({label: String(i).padStart(2,'0'), value: i})); // 0-24h
const MIN_OPTS   = Array.from({length: 60}, (_, i) => ({label: String(i).padStart(2,'0'), value: i})); // 0-59min
const SEC_OPTS   = Array.from({length: 60}, (_, i) => ({label: String(i).padStart(2,'0'), value: i})); // 0-59sec
const ITEM_H = 36; // 滚轮每行高度（px）

const STORAGE_KEY = 'farm_reminder_crops_v1';

// ─── Storage ─────────────────────────────────────────────────────────────────

function loadCrops(): CropRecord[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const crops: CropRecord[] = raw ? JSON.parse(raw) : [];
        // 修复损坏数据：已收获但无 harvestTime 的记录
        return crops.map(c => {
            if (c.status === '已收获' && !c.harvestedAt) {
                return {...c, harvestedAt: c.plantTime};
            }
            return c;
        });
    }
    catch {
        return [];
    }
}

function saveCrops(crops: CropRecord[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(crops));
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function calcHarvestTime(totalSec: number, landType: LandType): number {
    return totalSec * (1 - LAND_DISCOUNT[landType]) / 3600; // 返回小时数（含小数）
}

function formatCountdown(ms: number): {text: string; total: number} {
    if (ms <= 0) return {text: '可收获！', total: 0};
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const text = h > 0 ? `${h}小时${m}分${s}秒` : m > 0 ? `${m}分${s}秒` : `${s}秒`;
    return {text, total: ms};
}

function formatDatetime(iso: string): string {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatPlantTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH  = Math.floor(diffMs / 3600000);
    const diffM  = Math.floor((diffMs % 3600000) / 60000);
    const diffS  = Math.floor((diffMs % 60000) / 1000);
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    if (diffH < 1 && diffM < 1) return `${diffS}秒前 (${timeStr})`;
    if (diffH < 1) return `${diffM}分${diffS}秒前 (${timeStr})`;
    return `${diffH}小时${diffM}分前 (${timeStr})`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// 进度环（SVG 圆环）
function ProgressRing({progress, size = 80, stroke = 6, color = '#4caf50'}: {
    progress: number; size?: number; stroke?: number; color?: string;
}) {
    const r = (size - stroke) / 2;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - Math.min(progress, 100) / 100);
    return (
        <svg width={size} height={size} className={c.ring}>
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e0e0e0" strokeWidth={stroke} />
            <circle
                cx={size/2} cy={size/2} r={r} fill="none"
                stroke={color} strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${size/2} ${size/2})`}
            />
        </svg>
    );
}

// 蔬菜卡片
function CropCard({crop, onHarvest, onDelete, onFertilize}: {
    crop: CropRecord;
    onHarvest: (id: number) => void;
    onDelete: (id: number) => void;
    onFertilize: (id: number) => void;
}) {
    const [remaining, setRemaining] = useState<{text: string; total: number} | null>(null);

    useEffect(() => {
        function tick() {
            const ms = new Date(crop.harvestTime).getTime() - Date.now();
            setRemaining(formatCountdown(ms));
        }
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [crop.harvestTime]);

    const isReady = remaining !== null && remaining.total <= 0;
    const isHarvested = crop.status === '已收获';
    const landConf = LAND_CONFIG[crop.landType];

    // 进度：已度过时间 / 总时长
    const totalMs = new Date(crop.harvestTime).getTime() - new Date(crop.plantTime).getTime();
    const elapsedMs = totalMs - (remaining?.total ?? totalMs);
    const progressColor = isReady ? '#ff6b6b' : isHarvested ? '#aaa' : '#4caf50';
    const ringProgress = isHarvested ? 100 : (isReady ? 100 : (totalMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) : 0));

    return (
        <div className={c.card}>
            {/* 进度环 */}
            <div className={c.ringWrap}>
                <ProgressRing progress={ringProgress} color={progressColor} />
                <div className={c.ringCenter}>
                    {isHarvested ? '✅' : isReady ? '🔔' : '🌱'}
                </div>
            </div>

            {/* 信息 */}
            <div className={c.cardInfo}>
                <div className={c.cardName}>{crop.name}</div>
                <div className={c.cardMeta}>
                    <span className={c.landTag} style={{background: landConf.tagColor}}>
                        {landConf.label}
                    </span>
                    <span className={c.timeTag}>
                        ⏱ {crop.actualHours}h
                    </span>
                </div>
                <div className={c.cardTime}>
                    {isHarvested
                        ? `收获于 ${crop.harvestedAt ? formatDatetime(crop.harvestedAt) : '未知时间'}`
                        : isReady
                            ? '🎉 可以收获啦！'
                            : `剩余 ${remaining?.text ?? ''}`
                    }
                </div>
                <div className={c.cardTime} style={{fontSize: '11px', color: '#999', marginTop: '2px'}}>
                    种植 {formatPlantTime(crop.plantTime)}
                </div>
            </div>

            {/* 操作 */}
            <div className={c.cardActions}>
                {(isReady && !isHarvested) && (
                    <button className={c.btnHarvest} onClick={() => onHarvest(crop.id)}>
                        🌾 收获
                    </button>
                )}
                {!isReady && !isHarvested && (
                    <button className={c.btnFertilize} onClick={() => onFertilize(crop.id)}>
                        🧪 化肥催熟
                    </button>
                )}
                <button className={c.btnDelete} onClick={() => onDelete(crop.id)}>
                    🗑
                </button>
            </div>
        </div>
    );
}

// 滚轮单列
function WheelCol({options, value, onChange, label}: {
    options: {label: string; value: number}[];
    value: number;
    onChange: (v: number) => void;
    label: string;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // 初始化 / 同步滚动位置
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = value * ITEM_H;
    }, [value]);

    function onScroll() {
        const el = scrollRef.current;
        if (!el) return;
        const raw = el.scrollTop / ITEM_H;
        const idx = Math.round(raw);
        const clamped = Math.max(0, Math.min(options.length - 1, idx));
        if (clamped !== value) onChange(clamped);
    }

    return (
        <div className={c.wheelCol}>
            <div className={c.wheelMask} />
            <div
                ref={scrollRef}
                className={c.wheelScroll}
                onScroll={onScroll}
            >
                {/* 上下各3个占位，保证首尾可居中 */}
                {Array.from({length: 3}).map((_, i) => (
                    <div key={`top${i}`} className={c.wheelItem} style={{height: ITEM_H}} />
                ))}
                {options.map((opt, i) => (
                    <div
                        key={i}
                        className={`${c.wheelItem} ${value === i ? c.wheelItemActive : ''}`}
                    >
                        {opt.label}
                    </div>
                ))}
                {Array.from({length: 3}).map((_, i) => (
                    <div key={`bot${i}`} className={c.wheelItem} style={{height: ITEM_H}} />
                ))}
            </div>
            <div className={c.wheelLabel}>{label}</div>
        </div>
    );
}

// 滚轮时间选择器（H:M:S）
function WheelTimePicker({h, m, s, onChange}: {
    h: number; m: number; s: number;
    onChange: (part: {h?: number; m?: number; s?: number}) => void;
}) {
    return (
        <div className={c.wheelPickerWrap}>
            <WheelCol label="时" options={HOUR_OPTS}  value={h} onChange={v => onChange({h: v})} />
            <div className={c.wheelSep}>:</div>
            <WheelCol label="分" options={MIN_OPTS}   value={m} onChange={v => onChange({m: v})} />
            <div className={c.wheelSep}>:</div>
            <WheelCol label="秒" options={SEC_OPTS}   value={s} onChange={v => onChange({s: v})} />
        </div>
    );
}

// 添加蔬菜弹窗
function AddModal({onAdd, onClose}: {onAdd: (crop: Omit<CropRecord, 'id' | 'status'>) => void; onClose: () => void}) {
    const [name, setName]   = useState('');
    const [h, setH]         = useState(0); // 默认0h
    const [m, setM]         = useState(8); // 默认8min → 使默认 ≈ 8小时总秒数? 不，设1h
    const [s, setS]         = useState(0);
    const [landIdx, setLandIdx] = useState(0); // 默认选普通

    const lands: LandType[] = ['普通', '红土地', '黑土地', '金土地'];
    const totalSec  = h * 3600 + m * 60 + s;
    const landType  = lands[landIdx];
    const actualH   = calcHarvestTime(totalSec, landType); // 小时（含小数）

    function handleSubmit() {
        if (!name.trim() || totalSec === 0) return;
        const now = new Date();
        onAdd({
            name: name.trim(),
            totalSec,
            actualHours: actualH,
            landType,
            plantTime: now.toISOString(),
            harvestTime: new Date(now.getTime() + actualH * 3600000).toISOString(),
        });
        onClose();
    }

    function setTime(part: {h?: number; m?: number; s?: number}) {
        if (part.h !== undefined) setH(part.h);
        if (part.m !== undefined) setM(part.m);
        if (part.s !== undefined) setS(part.s);
    }

    return (
        <div className={c.modalOverlay} onClick={onClose}>
            <div className={c.modal} onClick={e => e.stopPropagation()}>
                <div className={c.modalHeader}>
                    <span>🌱 添加种植记录</span>
                    <button className={c.modalClose} onClick={onClose}>✕</button>
                </div>

                <div className={c.modalBody}>
                    {/* 蔬菜名 */}
                    <div className={c.formGroup}>
                        <label>蔬菜名称</label>
                        <input
                            className={c.input}
                            placeholder="如：萝卜、白菜、黄瓜"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                            autoFocus
                        />
                    </div>

                    {/* 滚轮时间选择 */}
                    <div className={c.formGroup}>
                        <label>成熟时间</label>
                        <WheelTimePicker h={h} m={m} s={s} onChange={setTime} />
                    </div>

                    {/* 土地选择 */}
                    <div className={c.formGroup}>
                        <label>土地类型</label>
                        <div className={c.landGrid}>
                            {lands.map((land, i) => (
                                <button
                                    key={land}
                                    className={`${c.landBtn} ${landIdx === i ? c.landBtnActive : ''}`}
                                    style={landIdx === i ? {borderColor: LAND_CONFIG[land].tagColor, color: LAND_CONFIG[land].tagColor} : {}}
                                    onClick={() => setLandIdx(i)}
                                >
                                    <span className={c.landBtnName}>{land}</span>
                                    <span className={c.landBtnDesc}>{LAND_CONFIG[land].desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 预览 */}
                    <div className={c.preview}>
                        <div className={c.previewRow}>
                            <span>基础时间</span>
                            <span>{h > 0 ? `${h}小时` : ''}{m > 0 ? `${m}分` : ''}{s > 0 ? `${s}秒` : ''}{totalSec === 0 ? '0秒' : ''}</span>
                        </div>
                        <div className={c.previewRow}>
                            <span>土地效果</span>
                            <span style={{color: LAND_DISCOUNT[landType] > 0 ? '#4caf50' : '#999'}}>
                                {LAND_DISCOUNT[landType] > 0 ? `-${LAND_DISCOUNT[landType] * 100}%` : '无折扣'}
                            </span>
                        </div>
                        <div className={c.previewRow + ' ' + c.previewRowHighlight}>
                            <span>实际成熟</span>
                            <span>⏱ {actualH.toFixed(2)} 小时</span>
                        </div>
                    </div>
                </div>

                <div className={c.modalFooter}>
                    <button className={c.btnCancel} onClick={onClose}>取消</button>
                    <button
                        className={c.btnConfirm}
                        onClick={handleSubmit}
                        disabled={!name.trim() || totalSec === 0}
                    >
                        ✅ 确定添加
                    </button>
                </div>
            </div>
        </div>
    );
}

// 统计卡片
function StatsBar({crops}: {crops: CropRecord[]}) {
    const pending = crops.filter(c => c.status === '待收获');
    const ready = pending.filter(c => new Date(c.harvestTime).getTime() <= Date.now());
    const harvested = crops.filter(c => c.status === '已收获');

    return (
        <div className={c.statsBar}>
            <div className={c.statItem}>
                <span className={c.statNum}>{pending.length}</span>
                <span className={c.statLabel}>待收获</span>
            </div>
            <div className={c.statItem} style={{color: '#ff6b6b'}}>
                <span className={c.statNum}>{ready.length}</span>
                <span className={c.statLabel}>可收获</span>
            </div>
            <div className={c.statItem} style={{color: '#4caf50'}}>
                <span className={c.statNum}>{harvested.length}</span>
                <span className={c.statLabel}>已收获</span>
            </div>
        </div>
    );
}

// 收获成功弹窗
function HarvestSuccessModal({cropName, onClose}: {cropName: string; onClose: () => void}) {
    const [count, setCount] = useState(3);

    useEffect(() => {
        const id = setInterval(() => {
            setCount(c => {
                if (c <= 1) { onClose(); return c; }
                return c - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [onClose]);

    return (
        <div className={c.successOverlay} onClick={onClose}>
            <div className={c.successCard} onClick={e => e.stopPropagation()}>
                {/* 顶部屋檐装饰 */}
                <div className={c.successRoof}>
                    <div className={c.successRoofLeft} />
                    <div className={c.successRoofCenter}>
                        <span className={c.successRoofStar}>✦</span>
                    </div>
                    <div className={c.successRoofRight} />
                </div>
                {/* 礼花 */}
                <div className={c.confettiRow}>
                    {['🎉','✨','🌟','⭐','✨','🎉','⭐','🌟','✨'].map((e,i)=>(
                        <span key={i} className={c.confettiItem} style={{animationDelay:`${i*0.12}s`}}>{e}</span>
                    ))}
                </div>
                {/* 主内容区 */}
                <div className={c.successContent}>
                    <div className={c.successCropIcon}>
                        <div className={c.successCropEmoji}>🌾</div>
                        <div className={c.successCropGlow} />
                    </div>
                    <div className={c.successTextBlock}>
                        <div className={c.successTitle}>收获成功!</div>
                        <div className={c.successSub}>恭喜收下了 <strong>{cropName}</strong></div>
                    </div>
                </div>
                {/* 底部装饰 */}
                <div className={c.successBottom}>
                    <div className={c.successDivider} />
                    <button className={c.successBtn} onClick={onClose}>
                        确 定({count}s)
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FarmReminder() {
    const [crops, setCrops] = useState<CropRecord[]>(() => loadCrops());
    const [showAdd, setShowAdd] = useState(false);
    const [filter, setFilter] = useState<'all' | 'pending' | 'ready'>('all');
    const [successCrop, setSuccessCrop] = useState<string | null>(null);

    // 持久化
    useEffect(() => { saveCrops(crops); }, [crops]);

    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(n => n + 1), 5000);
        return () => clearInterval(id);
    }, []);

    // 收获
    const handleHarvest = useCallback((id: number) => {
        const crop = crops.find(c => c.id === id);
        setCrops(prev => prev.map(c =>
            c.id === id ? {...c, status: '已收获', harvestedAt: new Date().toISOString()} : c
        ));
        if (crop) setSuccessCrop(crop.name);
    }, [crops]);

    // 化肥催熟
    const handleFertilize = useCallback((id: number) => {
        setCrops(prev => prev.map(c =>
            c.id === id
                ? {...c, harvestTime: new Date().toISOString()}
                : c
        ));
    }, []);

    // 删除
    const handleDelete = useCallback((id: number) => {
        setCrops(prev => prev.filter(c => c.id !== id));
    }, []);

    const idRef = useRef<number>((() => {
        const crops = loadCrops();
        return crops.length > 0 ? Math.max(...crops.map(c => c.id)) + 1 : 1;
    })());
    const nextId = () => idRef.current++;

    // 添加
    const handleAdd = useCallback((crop: Omit<CropRecord, 'id' | 'status'>) => {
        setCrops(prev => [...prev, {
            ...crop,
            id: nextId(),
            status: '待收获',
        }]);
    }, []);

    // 待显示列表
    const readyCount = crops.filter(c => c.status === '待收获' && new Date(c.harvestTime).getTime() <= Date.now()).length;
    const filtered = crops.filter(c => {
        if (filter === 'pending') return c.status === '待收获' && new Date(c.harvestTime).getTime() > Date.now();
        if (filter === 'ready') return c.status === '待收获' && new Date(c.harvestTime).getTime() <= Date.now();
        return true;
    });

    return (
        <div className={c.page}>
            {/* 顶部导航 */}
            <div className={c.header}>
                <div className={c.headerLeft}>
                    <DodoFarm className={c.headerLogo} />
                    <div>
                        <div className={c.headerTitle}>🌾 QQ农场</div>
                        <div className={c.headerSub}>蔬菜收获提醒</div>
                    </div>
                </div>
                <button className={c.addBtn} onClick={() => setShowAdd(true)}>
                    + 添加
                </button>
            </div>

            {/* 可收获提醒 */}
            {readyCount > 0 && (
                <div className={c.readyBanner}>
                    🔔 {readyCount} 棵蔬菜可以收获啦！快去看看 🌾
                </div>
            )}

            {/* 统计 */}
            <StatsBar crops={crops} />

            {/* 筛选 */}
            <div className={c.filterBar}>
                {(['all', 'pending', 'ready'] as const).map(f => (
                    <button
                        key={f}
                        className={`${c.filterBtn} ${filter === f ? c.filterBtnActive : ''}`}
                        onClick={() => setFilter(f)}
                    >
                        {f === 'all' ? '全部' : f === 'pending' ? '待收获' : '可收获'}
                    </button>
                ))}
            </div>

            {/* 列表 */}
            <div className={c.list}>
                {filtered.length === 0 ? (
                    <div className={c.empty}>
                        <div className={c.emptyEmoji}>🌿</div>
                        <div className={c.emptyText}>
                            {filter === 'all' ? '还没有种植记录，快去添加吧！'
                                : filter === 'ready' ? '暂无可以收获的蔬菜 🎉'
                                : '暂无待收获的蔬菜'}
                        </div>
                    </div>
                ) : (
                    filtered.map(crop => (
                        <CropCard
                            key={crop.id}
                            crop={crop}
                            onHarvest={handleHarvest}
                            onDelete={handleDelete}
                            onFertilize={handleFertilize}
                        />
                    ))
                )}
            </div>

            {/* 底部 Tab（占位，保持美观） */}
            <div className={c.tabBar}>
                <div className={c.tabItem + ' ' + c.tabItemActive}>
                    🌾 农场
                </div>
            </div>

            {/* 添加弹窗 */}
            {showAdd && <AddModal onAdd={handleAdd} onClose={() => setShowAdd(false)} />}

            {/* 收获成功弹窗 */}
            {successCrop !== null && (
                <HarvestSuccessModal
                    cropName={successCrop}
                    onClose={() => { setSuccessCrop(null); setFilter('all'); }}
                />
            )}
        </div>
    );
}