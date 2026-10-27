import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { validateRequiredText, validateNumeric } from '../utils/validation';
import InlineNotice, { FieldError } from '../components/InlineNotice';
import ConfirmDialog from '../components/ConfirmDialog';

const PRICE_MAX = 100000;   // ₹1,00,000 (database check products_price_max)
const STOCK_MAX = 100000;   // database check products_stock_max

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  // Edit/Add Form Modal
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    id: '',
    seller_id: '',
    product_name: '',
    description: '',
    price: '',
    stock: '',
    image_path: '',
    category: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [
        { data: productsData },
        { data: categoriesData },
        { data: sellersData }
      ] = await Promise.all([
        supabase.from('products').select('*, seller:seller_id(shop_name, profiles:user_id(full_name))').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').eq('context', 'product'),
        supabase.from('seller_profiles').select('*, profiles:user_id(full_name)')
      ]);

      setProducts(productsData || []);
      setCategories(categoriesData || []);
      setSellers(sellersData || []);
    } catch (err) {
      console.error('Error fetching products data:', err);
      setNotice({ type: 'error', text: 'Products could not be loaded. Please check your connection and try again.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAdd = () => {
    setIsEditing(false);
    setForm({
      id: '',
      seller_id: sellers[0]?.id || '',
      product_name: '',
      description: '',
      price: '',
      stock: '',
      image_path: '',
      category: categories[0]?.name || 'Fertilizers'
    });
    setFieldErrors({}); setFormError('');
    setShowModal(true);
  };

  const handleOpenEdit = (p) => {
    setIsEditing(true);
    setForm({
      id: p.id,
      seller_id: p.seller_id,
      product_name: p.product_name,
      description: p.description || '',
      price: p.price,
      stock: p.stock,
      image_path: p.image_path || '',
      category: p.category || ''
    });
    setFieldErrors({}); setFormError('');
    setShowModal(true);
  };

  const confirmDelete = async () => {
    const productId = deleteId;
    setDeleteId(null);
    try {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
      setNotice({ type: 'success', text: 'Product deleted.' });
      fetchData();
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Error deleting product' });
    }
  };

  // Every field is checked at once; each message appears under its field.
  const validateForm = () => {
    const errs = {};
    const nameVal = validateRequiredText(form.product_name, 'Product Name', 2, 120);
    if (!nameVal.isValid) errs.product_name = nameVal.error;
    const priceVal = validateNumeric(form.price, { min: 0.01, max: PRICE_MAX, maxDecimals: 2, fieldName: 'Price' });
    if (!priceVal.isValid) errs.price = priceVal.error;
    const stockVal = validateNumeric(form.stock, { min: 0, max: STOCK_MAX, allowDecimal: false, fieldName: 'Stock Quantity' });
    if (!stockVal.isValid) errs.stock = stockVal.error;
    if (!form.seller_id) errs.seller_id = 'Please choose the seller shop.';
    const img = (form.image_path || '').trim();
    if (img && !/^https:\/\/[^\s]+$/i.test(img)) errs.image_path = 'Image URL must start with https:// and contain no spaces.';
    if ((form.description || '').trim().length > 2000) errs.description = 'Please keep the description under 2000 characters.';
    return { errs, nameVal, priceVal, stockVal };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const { errs, nameVal, priceVal, stockVal } = validateForm();
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`product-${Object.keys(errs)[0]}`)?.focus();
      return;
    }

    try {
      const payload = {
        seller_id: form.seller_id,
        product_name: nameVal.value,
        description: form.description ? form.description.trim() : '',
        price: priceVal.value,
        stock: stockVal.value,
        image_path: form.image_path ? form.image_path.trim() : '',
        category: form.category
      };

      if (isEditing) {
        const { error } = await supabase.from('products').update(payload).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw error;
      }

      setShowModal(false);
      setNotice({ type: 'success', text: isEditing ? 'Product updated.' : 'Product added.' });
      fetchData();
    } catch (err) {
      setFormError(/fetch|network/i.test(err.message || '') ? 'No connection. The product was not saved.' : (err.message || 'Error saving product'));
    }
  };

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-headline-xl text-on-surface mb-1">Products Catalog</h1>
          <p className="font-body-sm text-on-surface-variant">View, create, edit, or delete items sold in the marketplace.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="bg-primary-container hover:bg-primary-container/90 text-on-primary-container font-semibold px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          <span>Add Product</span>
        </button>
      </div>

      <InlineNotice notice={notice} onClose={() => setNotice(null)} />

      <div className="card-bg rounded-xl overflow-hidden border border-outline-variant">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" />
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider bg-surface-container">
                <th className="p-4">Product</th>
                <th className="p-4">Seller/Shop</th>
                <th className="p-4">Category</th>
                <th className="p-4">Price</th>
                <th className="p-4">Stock</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {products.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-on-surface-variant/50">No products found</td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-variant/20 transition-colors">
                    <td className="p-4 flex items-center gap-3">
                      <div className="w-10 h-10 bg-surface-variant rounded flex items-center justify-center overflow-hidden border border-outline-variant/30">
                        {p.image_path ? (
                          <img alt={p.product_name} className="w-full h-full object-cover" src={p.image_path} />
                        ) : (
                          <span className="material-symbols-outlined text-on-surface-variant">shopping_bag</span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-on-surface">{p.product_name}</span>
                        <span className="text-[10px] text-on-surface-variant max-w-[200px] truncate">{p.description}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-on-surface">{p.seller?.shop_name || 'N/A'}</span>
                        <span className="text-[10px] text-on-surface-variant">{p.seller?.profiles?.full_name || 'Anonymous'}</span>
                      </div>
                    </td>
                    <td className="p-4 uppercase font-bold text-[10px] text-on-surface-variant">{p.category || 'General'}</td>
                    <td className="p-4 text-primary-container font-semibold">
                      {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p.price)}
                    </td>
                    <td className="p-4 text-on-surface-variant font-mono">{p.stock} units</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="bg-surface-variant text-on-surface hover:text-on-surface-variant px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteId(p.id)}
                          className="bg-error/10 text-error hover:bg-error/20 border border-error/30 px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit/Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="max-w-md w-full card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-4 shadow-2xl">
            <h2 className="font-headline-lg-mobile text-on-surface border-b border-outline-variant/30 pb-2">
              {isEditing ? 'Edit Product' : 'Add Product'}
            </h2>

            <InlineNotice notice={formError ? { type: 'error', text: formError } : null} />

            <div className="flex flex-col gap-1">
              <label htmlFor="product-product_name" className="font-label-md text-on-surface-variant font-bold">Product Name</label>
              <input
                id="product-product_name"
                type="text"
                maxLength={120}
                aria-invalid={!!fieldErrors.product_name}
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
              />
              <FieldError message={fieldErrors.product_name} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="product-price" className="font-label-md text-on-surface-variant font-bold">Price (₹)</label>
                <input
                  id="product-price"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 249.50"
                  aria-invalid={!!fieldErrors.price}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
                />
                <FieldError message={fieldErrors.price} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="product-stock" className="font-label-md text-on-surface-variant font-bold">Stock Quantity</label>
                <input
                  id="product-stock"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 40"
                  aria-invalid={!!fieldErrors.stock}
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
                />
                <FieldError message={fieldErrors.stock} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-md text-on-surface-variant font-bold">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
              >
                {categories.length > 0 ? (
                  categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)
                ) : (
                  <>
                    <option value="Fertilizers">Fertilizers</option>
                    <option value="Seeds">Seeds</option>
                    <option value="Equipment">Equipment</option>
                    <option value="Organic Products">Organic Products</option>
                  </>
                )}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-md text-on-surface-variant font-bold">Associated Seller Shop</label>
              <select
                id="product-seller_id"
                value={form.seller_id}
                onChange={(e) => setForm({ ...form, seller_id: e.target.value })}
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
              >
                {sellers.map(s => (
                  <option key={s.id} value={s.id}>{s.shop_name} ({s.profiles?.full_name})</option>
                ))}
              </select>
              <FieldError message={fieldErrors.seller_id} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-md text-on-surface-variant font-bold">Image URL</label>
              <input
                id="product-image_path"
                type="url"
                value={form.image_path}
                onChange={(e) => setForm({ ...form, image_path: e.target.value })}
                placeholder="https://example.com/product.jpg"
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
              />
              <FieldError message={fieldErrors.image_path} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-md text-on-surface-variant font-bold">Description</label>
              <textarea
                id="product-description"
                maxLength={2000}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container h-16"
              />
              <FieldError message={fieldErrors.description} />
            </div>

            <div className="flex justify-end gap-3 border-t border-outline-variant/30 pt-3 mt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="bg-surface-variant text-on-surface hover:text-on-surface-variant px-4 py-2 rounded-lg font-label-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-primary-container hover:bg-primary-container/90 text-on-primary-container font-semibold px-4 py-2 rounded-lg font-label-md transition-colors cursor-pointer"
              >
                Save Product
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        danger
        title="Delete this product?"
        message="The product is removed from the shop. This cannot be undone."
        confirmLabel="Delete product"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
