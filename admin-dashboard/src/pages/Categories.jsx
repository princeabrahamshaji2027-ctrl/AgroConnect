import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = async () => {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) console.error(error);
    else setCategories(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Categories</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="w-full table-auto border-collapse">
          <thead className="bg-surface-container-highest">
            <tr>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-left">Context</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {categories.map((cat) => (
              <tr key={cat.id}>
                <td className="p-2">{cat.name}</td>
                <td className="p-2">{cat.context}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
