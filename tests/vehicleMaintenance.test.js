const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./loadTs");

const lib = loadTs("src/lib/vehicleMaintenance.ts");
const today = new Date(2026, 10, 27, 10, 0); // 27/11/2026

const plan = (over = {}) => ({ id: "p1", vehicleId: "v1", name: "Óleo", intervalKm: 10000, intervalMonths: 6, baselineOdometerKm: 40000, baselineDate: "2026-06-01", isActive: true, ...over });
const rec = (over = {}) => ({ id: "r", vehicleId: "v1", kind: "preventiva", description: "x", serviceDate: "2026-11-01", partsCost: 0, laborCost: 0, ...over });

test("addMonths: respeita fim de mês e vira o ano", () => {
    assert.equal(lib.addMonths("2026-08-31", 6), "2027-02-28");
    assert.equal(lib.addMonths("2026-11-15", 3), "2027-02-15");
    assert.equal(lib.addMonths("2024-08-31", 6), "2025-02-28");
    assert.equal(lib.addMonths("2026-01-31", 1), "2026-02-28");
});

test("plano: vencida por km, por data, em breve, ok e sem base", () => {
    // base 40.000 km + 10.000 = 50.000; 6 meses de 01/06 = 01/12 (faltam 4 dias)
    const soonByDate = lib.planStatus(plan(), [], 45000, today);
    assert.equal(soonByDate.state, "breve");
    assert.equal(soonByDate.nextKm, 50000);
    assert.equal(soonByDate.nextDate, "2026-12-01");
    assert.equal(soonByDate.kmLeft, 5000);
    assert.equal(soonByDate.daysLeft, 4);

    assert.equal(lib.planStatus(plan(), [], 50300, today).state, "vencida");
    assert.match(lib.planStatus(plan(), [], 50300, today).label, /vencida há 300 km/);
    assert.equal(lib.planStatus(plan({ baselineDate: "2026-05-01" }), [], 45000, today).state, "vencida"); // data passou
    assert.equal(lib.planStatus(plan({ intervalMonths: undefined }), [], 45000, today).state, "ok");
    assert.equal(lib.planStatus(plan({ intervalMonths: undefined }), [], 49200, today).state, "breve"); // < 1.000 km
    assert.equal(lib.planStatus(plan({ baselineOdometerKm: undefined, baselineDate: undefined }), [], 45000, today).state, "sem_base");
    // sem hodômetro atual, mas com data: vale só o prazo
    assert.equal(lib.planStatus(plan({ intervalKm: undefined, baselineDate: "2026-11-20" }), [], undefined, today).state, "ok");
});

test("plano: a última execução registrada vira a nova base", () => {
    const records = [
        rec({ planId: "p1", serviceDate: "2026-10-10", odometerKm: 48000 }),
        rec({ planId: "p1", serviceDate: "2026-11-20", odometerKm: 49500 }),
        rec({ planId: "outro", serviceDate: "2026-11-25", odometerKm: 49900 }),
    ];
    const st = lib.planStatus(plan(), records, 50000, today);
    assert.equal(st.lastKm, 49500);
    assert.equal(st.nextKm, 59500);
    assert.equal(st.nextDate, "2027-05-20");
    assert.equal(st.state, "ok");
});

test("alertas: vencidas primeiro, inativos de fora", () => {
    const plans = [plan({ id: "a", intervalMonths: undefined }), plan({ id: "b", intervalMonths: undefined, baselineOdometerKm: 30000 }), plan({ id: "c", isActive: false })];
    const out = lib.planAlerts(plans, [], () => 45000, today);
    assert.deepEqual(out.map(x => x.plan.id), ["b", "a"]);
    assert.equal(out[0].status.state, "vencida");
});

test("custos: soma peças + mão de obra e separa preventiva/corretiva e categoria", () => {
    const b = lib.costBreakdown([
        rec({ kind: "preventiva", category: "Pneus", partsCost: 800, laborCost: 100 }),
        rec({ kind: "corretiva", category: " pneus ", partsCost: 200.5, laborCost: 0 }),
        rec({ kind: "corretiva", partsCost: 50, laborCost: 50 }),
    ]);
    assert.equal(b.total, 1200.5);
    assert.equal(b.parts, 1050.5);
    assert.equal(b.labor, 150);
    assert.deepEqual(b.preventiva, { count: 1, total: 900 });
    assert.deepEqual(b.corretiva, { count: 2, total: 300.5 });
    assert.deepEqual(b.byCategory.map(c => [c.category, c.count, c.total]), [["Pneus", 2, 1100.5], ["Sem categoria", 1, 100]]);
});

test("custo por veículo: manutenção + combustível, km fechado e custo por km", () => {
    const vehicles = [{ id: "v1", plate: "AAA1A11" }, { id: "v2", plate: "BBB2B22" }];
    const out = lib.vehicleCosts({
        vehicles,
        maintenances: [rec({ vehicleId: "v1", partsCost: 400, laborCost: 100, serviceDate: "2026-11-05" }), rec({ vehicleId: "v1", kind: "corretiva", partsCost: 300, serviceDate: "2026-10-05" })],
        fuel: [{ vehicleId: "v1", fuelDate: "2026-11-10", totalValue: 300 }, { vehicleId: "v2", fuelDate: "2026-11-11", totalValue: 100 }],
        kmLogs: [
            { vehicleId: "v1", logDate: "2026-11-02", odometerStart: 1000, odometerEnd: 1400 },
            { vehicleId: "v1", logDate: "2026-11-03", odometerStart: 1400 }, // em uso: não conta
            { vehicleId: "v2", logDate: "2026-11-04", odometerStart: 500, odometerEnd: 600 },
        ],
        period: "mes",
        now: today,
    });
    assert.deepEqual(out.rows.map(r => r.plate), ["AAA1A11", "BBB2B22"]);
    const a = out.rows[0];
    assert.deepEqual([a.fuel, a.maintenance, a.preventive, a.corrective, a.total, a.km, a.costPerKm], [300, 500, 500, 0, 800, 400, 2]);
    assert.equal(out.rows[1].costPerKm, 1);
    assert.equal(out.totals.total, 900);
    assert.equal(out.totals.km, 500);
    assert.equal(out.totals.costPerKm, 1.8);
    // tudo: entra a corretiva de outubro
    assert.equal(lib.vehicleCosts({ vehicles, maintenances: [rec({ vehicleId: "v1", kind: "corretiva", partsCost: 300, serviceDate: "2026-10-05" })], fuel: [], kmLogs: [], period: "tudo", now: today }).totals.corrective, 300);
});

test("gasto mês a mês e planilhas", () => {
    const m = lib.monthlyCosts([rec({ partsCost: 100, serviceDate: "2026-10-05" }), rec({ partsCost: 50, laborCost: 50, serviceDate: "2026-11-05" })], [{ vehicleId: "v1", fuelDate: "2026-11-10", totalValue: 30 }], 3, today);
    assert.deepEqual(m.map(x => x.label), ["set/26", "out/26", "nov/26"]);
    assert.deepEqual(m.map(x => [x.maintenance, x.fuel]), [[0, 0], [100, 0], [100, 30]]);
    const sheet = lib.maintenanceSheet([rec({ kind: "corretiva", partsCost: 10, laborCost: 5, supplier: "Oficina X" })], () => "AAA1A11");
    assert.equal(sheet.headers.length, sheet.rows[0].values.length);
    assert.equal(sheet.rows[0].values[8], 15);
    assert.equal(sheet.rows[0].tone, "red");
    const costs = lib.vehicleCosts({ vehicles: [{ id: "v1", plate: "AAA1A11" }], maintenances: [], fuel: [], kmLogs: [], period: "tudo", now: today });
    const cs = lib.costsSheet(costs.rows, costs.totals, "Tudo");
    assert.equal(cs.rows[cs.rows.length - 1].values[0], "TOTAL");
});
