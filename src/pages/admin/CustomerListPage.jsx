import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useUser } from '../../contexts/UserContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import './CustomerListPage.css';

const CustomerListPage = () => {
  const { profile, loading: userLoading } = useUser();
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const fetchCustomers = useCallback(async () => {
    if (!profile?.salon_id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('salon_customers')
        .select('profiles(*)')
        .eq('salon_id', profile.salon_id);

      if (error) throw error;
      
      const customerProfiles = data.map(item => item.profiles).filter(Boolean);
      setCustomers(customerProfiles);

    } catch (error) {
      console.error('顧客リストの取得に失敗しました:', error);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.salon_id]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = customers.filter(customer =>
    customer.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRowClick = (customerId) => {
    navigate(`/admin/customer/${customerId}`);
  };

  if (userLoading || isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="customer-list-container">
      <div className="page-header">
        <h1>顧客管理</h1>
        <div className="search-container">
          <input
            type="text"
            placeholder="顧客名で検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="customer-table-container">
        <table className="customer-table">
          <thead>
            <tr>
              <th>氏名</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map(customer => (
                <tr key={customer.id} onClick={() => handleRowClick(customer.id)} className="customer-row">
                  <td>
                    <div className="customer-name-cell">
                      {customer.display_name || 'N/A'}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="1" className="no-results">該当する顧客が見つかりません。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CustomerListPage;

