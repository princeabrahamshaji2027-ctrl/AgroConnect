import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

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
    setShowModal(true);
  };

  const handleDelete = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
      fetchData();
    } catch (err) {
      alert(err.message || 'Error deleting product');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        seller_id: form.seller_id,
        product_name: form.product_name,
        description: form.description,
        price: parseFloat(form.price),
        stock: parseInt(form.stock),
        image_path: form.image_path,
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
      fetchData();
    } catch (err) {
      alert(err.message || 'Error saving product');
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
                          onClick={() => handleDelete(p.id)}
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

            <div className="flex flex-col gap-1">
              <label className="font-label-md text-on-surface-variant font-bold">Product Name</label>
              <input
                type="text"
                required
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="font-label-md text-on-surface-variant font-bold">Price (₹)</label>
                <input
                  type="number"
                  required
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-label-md text-on-surface-variant font-bold">Stock Quantity</label>
                <input
                  type="number"
                  required
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
                />
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
                value={form.seller_id}
                onChange={(e) => setForm({ ...form, seller_id: e.target.value })}
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
              >
                {sellers.map(s => (
                  <option key={s.id} value={s.id}>{s.shop_name} ({s.profiles?.full_name})</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-md text-on-surface-variant font-bold">Image URL</label>
              <input
                type="text"
                value={form.image_path}
                onChange={(e) => setForm({ ...form, image_path: e.target.value })}
                placeholder="https://example.com/product.jpg"
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-label-md text-on-surface-variant font-bold">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-[#1c221e] border border-outline-variant rounded-lg p-2.5 text-on-surface text-body-sm focus:outline-none focus:border-primary-container h-16"
              />
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
    </div>
  );
}
