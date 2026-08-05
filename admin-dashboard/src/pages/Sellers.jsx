import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function Sellers() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSellers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('seller_profiles')
        .select('*, profiles:user_id(full_name, phone, profile_image_path, location)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSellers(data || []);
    } catch (err) {
      console.error('Error fetching sellers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  const handleVerify = async (sellerId, newStatus) => {
    try {
      const { error } = await supabase
        .from('seller_profiles')
        .update({ verification_status: newStatus })
        .eq('id', sellerId);

      if (error) throw error;

      // Log audit trail
      await supabase.from('admin_audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: newStatus === 'Verified' ? 'verify_seller' : 'reject_seller',
        target_table: 'seller_profiles',
        target_id: sellerId,
        details: { status: newStatus }
      });

      fetchSellers();
    } catch (err) {
      alert(err.message || 'Error updating seller status');
    }
  };

  return (
    <div className="p-6 pb-24 max-w-[1600px] mx-auto flex flex-col gap-6">
      <div>
        <h1 className="font-headline-xl text-on-surface mb-1">Sellers</h1>
        <p className="font-body-sm text-on-surface-variant">Review and manage marketplace seller shops and verification statuses.</p>
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
                <th className="p-4">Owner</th>
                <th className="p-4">Shop Name</th>
                <th className="p-4">Location</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant/20">
              {sellers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-on-surface-variant/50">No sellers registered yet</td>
                </tr>
              ) : (
                sellers.map((seller) => (
                  <tr key={seller.id} className="hover:bg-surface-variant/20 transition-colors">
                    <td className="p-4 flex items-center gap-3">
                      <img
                        alt="Owner avatar"
                        className="w-9 h-9 rounded-full object-cover border border-outline-variant"
                        src={seller.profiles?.profile_image_path || "https://lh3.googleusercontent.com/aida-public/AB6AXuCBppjcEyZbhisQCBybkq6-kIO6Nx43RhZKz7bgZ7ecB5kBxE1VrMLz8MFwq7eH0QK-HXaZQ1R9SndR2NOMV4sBtnIzunCDMwZtv4gyxLkuo3ku2x1vR2rx4r3p8BUZkXqTIG2o34p078QeSEYc9YrxW2B2vcTDoi7aJyS3zngube3F720kKwCA6XLKFyKSbhOawoKFdWeT_7v8XdNvcQjqlSIABpjPDLmWmzlAcOsfWvPmxWfp5bYn"}
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-on-surface">{seller.profiles?.full_name || 'Anonymous'}</span>
                        <span className="text-[10px] text-on-surface-variant">{seller.profiles?.phone || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="p-4 font-bold text-on-surface">{seller.shop_name}</td>
                    <td className="p-4 text-on-surface-variant">{seller.profiles?.location || 'N/A'}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        seller.verification_status === 'Verified' ? 'bg-primary-container/20 text-primary-container' : 
                        seller.verification_status === 'Rejected' ? 'bg-error/20 text-error' : 'bg-secondary-container/20 text-secondary-container'
                      }`}>
                        {seller.verification_status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {seller.verification_status === 'Pending' ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleVerify(seller.id, 'Verified')}
                            className="bg-primary-container/10 text-primary-container hover:bg-primary-container/20 border border-primary-container/30 px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                          >
                            Approve Shop
                          </button>
                          <button
                            onClick={() => handleVerify(seller.id, 'Rejected')}
                            className="bg-error/10 text-error hover:bg-error/20 border border-error/30 px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleVerify(seller.id, seller.verification_status === 'Verified' ? 'Rejected' : 'Verified')}
                          className="bg-surface-variant text-on-surface hover:text-on-surface-variant px-3 py-1.5 rounded font-label-sm transition-colors cursor-pointer"
                        >
                          Toggle State
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
