import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('orders')
        .select('*, buyer:buyer_id(full_name), seller:seller_id(shop_name), order_items(*, products(product_name))')
        .order('created_at', { ascending: false });
      setOrders(data || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div><h1 className="font-headline-xl text-on-surface mb-1">Orders</h1>
        <p className="font-body-sm text-on-surface-variant">Marketplace order management.</p></div>
      <div className="card-bg rounded-xl overflow-hidden border border-outline-variant">
        {loading ? <div className="flex items-center justify-center p-12"><span className="animate-spin h-8 w-8 border-4 border-primary-container border-t-transparent rounded-full" /></div> : (
          <table className="w-full text-left border-collapse">
            <thead><tr className="border-b border-outline-variant/30 text-on-surface-variant text-[11px] font-bold uppercase tracking-wider bg-surface-container">
              <th className="p-4">Order ID</th><th className="p-4">Buyer</th><th className="p-4">Seller</th><th className="p-4">Amount</th><th className="p-4">Status</th><th className="p-4">Date</th>
            </tr></thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {orders.length === 0 ? <tr><td colSpan="6" className="p-8 text-center text-on-surface-variant/50">No orders yet</td></tr> : orders.map(o => (
                <tr key={o.id} className="hover:bg-surface-variant/20">
                  <td className="p-4 font-mono text-[11px] text-on-surface-variant">#{o.id.slice(0,8).toUpperCase()}</td>
                  <td className="p-4 text-on-surface">{o.buyer?.full_name || 'User'}</td>
                  <td className="p-4 text-on-surface-variant">{o.seller?.shop_name || 'Shop'}</td>
                  <td className="p-4 font-bold text-primary-container">₹{Number(o.total_amount).toLocaleString('en-IN')}</td>
                  <td className="p-4"><span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${o.status === 'Delivered' ? 'bg-primary-container/20 text-primary-container' : 'bg-secondary-container/20 text-secondary-container'}`}>{o.status}</span></td>
                  <td className="p-4 text-on-surface-variant text-[12px]">{new Date(o.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
