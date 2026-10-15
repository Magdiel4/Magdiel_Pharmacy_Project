import { articleGroups } from '../../../shared/catalogs.js';
// Conserva las referencias de los registros al actualizar el formato demo.
export function upgradeDemoData(state) {
  for (const table of ['customers', 'purchase_orders', 'purchase_order_lines', 'purchase_receipts'])
    state[table] ||= [];
  for (const article of state.products) {
    article.kind ??= 'Medicamento';
    article.active ??= true;
    article.saleable ??= true;
    article.expiration_required ??= true;
  }
  for (const asset of state.assets) {
    if (asset.product_id) continue;
    const article = {
      id: asset.id,
      sku: `ACT-${asset.id}`,
      name: asset.name,
      category: asset.category,
      price: 0,
      cost: Number(asset.purchase_value),
      min_stock: 0,
      prescription: false,
      kind: 'Equipo',
      active: true,
      saleable: false,
      expiration_required: false,
      created_at: asset.created_at,
    };
    state.products.push(article);
    asset.product_id = article.id;
  }
  for (const order of state.orders) {
    if (order.customer_id) continue;
    state.customers.push({
      id: order.id,
      code: `CLI-${order.id}`,
      name: order.customer,
      phone: order.phone,
      email: '',
      address: order.address,
      latitude: order.latitude,
      longitude: order.longitude,
      active: true,
      created_at: order.created_at,
    });
    order.customer_id = order.id;
  }
  if (!state.article_sequences) {
    state.article_sequences = Object.fromEntries(Object.keys(articleGroups).map((g) => [g, 0]));
    for (const article of [...state.products].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )) {
      article.article_group ||= {
        Medicamento: 'Medicamentos',
        Suministro: 'Suministros',
        Equipo: 'Activos',
      }[article.kind];
      article.previous_sku = article.sku;
      article.sku = `${articleGroups[article.article_group]}-${String(++state.article_sequences[article.article_group]).padStart(3, '0')}`;
    }
  }
  for (const article of state.products) delete article.kind;
  state.suppliers ||= [];
  state.order_lines ||= [];
  for (const order of state.orders) {
    if (state.order_lines.some((line) => line.order_id === order.id)) continue;
    const product = state.products.find((p) => p.id === order.product_id);
    state.order_lines.push({
      id: order.id,
      order_id: order.id,
      branch_id: order.branch_id,
      product_id: order.product_id,
      sku: product.sku,
      name: product.name,
      quantity: order.quantity,
      unit_price: Math.round((Number(order.total) / Number(order.quantity)) * 100) / 100,
      total: Number(order.total),
      created_at: order.created_at,
    });
    for (const allocation of state.order_allocations.filter((a) => a.order_id === order.id))
      allocation.order_line_id = order.id;
  }
  for (const order of state.purchase_orders) {
    if (order.status === 'Borrador') order.status = 'Creado';
    order.deleted_at ??= null;
    if (order.supplier_id) continue;
    let supplier = state.suppliers.find((s) => s.name === order.supplier);
    if (!supplier) {
      supplier = {
        id: order.id,
        account: `LEG-${order.id}`,
        name: order.supplier,
        supplier_type: 'Otro',
        description: '',
        nit: null,
        address: '',
        email: '',
        phone: '',
        active: false,
        needs_review: true,
        created_at: order.created_at,
      };
      state.suppliers.push(supplier);
    }
    order.supplier_id = supplier.id;
  }
  return state;
}
