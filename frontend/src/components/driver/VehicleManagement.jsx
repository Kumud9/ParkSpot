import React, { useState, useEffect } from 'react';
import { Car, Plus, Star, Edit2, Trash2, CheckCircle2, AlertCircle, X, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';

export function VehicleManagement({
  activeUser,
  vehicles = [],
  onVehiclesChange = null,
  onSelectForBooking = null,
  isLiveConnected = true
}) {
  const [localVehicles, setLocalVehicles] = useState(vehicles);
  const [isLoading, setIsLoading] = useState(false);
  const [errorNotice, setErrorNotice] = useState(null);
  const [successNotice, setSuccessNotice] = useState(null);

  // Form modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [formData, setFormData] = useState({
    nickname: '',
    make: '',
    model: '',
    registrationNumber: '',
    color: '',
    isDefault: false
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  // Load vehicles from backend on mount or when activeUser changes
  useEffect(() => {
    let isMounted = true;
    async function fetchVehicles() {
      if (!activeUser) return;
      setIsLoading(true);
      try {
        const list = await api.getVehicles();
        if (isMounted) {
          setLocalVehicles(list);
          if (onVehiclesChange) onVehiclesChange(list);
        }
      } catch (err) {
        console.warn('[ParkSpot] Failed to load vehicles:', err.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    fetchVehicles();
    return () => { isMounted = false; };
  }, [activeUser]);

  const openAddModal = () => {
    setEditingVehicle(null);
    setFormData({
      nickname: '',
      make: '',
      model: '',
      registrationNumber: '',
      color: '',
      isDefault: localVehicles.length === 0
    });
    setFormErrors({});
    setErrorNotice(null);
    setIsModalOpen(true);
  };

  const openEditModal = (vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      nickname: vehicle.nickname || '',
      make: vehicle.make || '',
      model: vehicle.model || '',
      registrationNumber: vehicle.registrationNumber || '',
      color: vehicle.color || '',
      isDefault: Boolean(vehicle.isDefault)
    });
    setFormErrors({});
    setErrorNotice(null);
    setIsModalOpen(true);
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.make.trim()) {
      errors.make = 'Make is required (e.g. Hyundai, Honda, Tata)';
    }
    if (!formData.model.trim()) {
      errors.model = 'Model is required (e.g. i20, City, Nexon)';
    }
    const cleanReg = formData.registrationNumber.trim().toUpperCase();
    if (!cleanReg) {
      errors.registrationNumber = 'Registration number is required';
    } else if (cleanReg.length < 3 || cleanReg.length > 20) {
      errors.registrationNumber = 'Enter a valid registration number (3 to 20 characters)';
    } else {
      // Check for duplicate in local state (excluding the one being edited)
      const duplicate = localVehicles.find(
        (v) => v.registrationNumber.toUpperCase() === cleanReg && (!editingVehicle || v.id !== editingVehicle.id)
      );
      if (duplicate) {
        errors.registrationNumber = 'This vehicle is already registered to your account.';
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setErrorNotice(null);

    const payload = {
      nickname: formData.nickname.trim() || undefined,
      make: formData.make.trim(),
      model: formData.model.trim(),
      registrationNumber: formData.registrationNumber.trim().toUpperCase(),
      color: formData.color.trim() || undefined,
      isDefault: Boolean(formData.isDefault)
    };

    try {
      let updatedList = [];
      if (editingVehicle) {
        // Update existing vehicle
        const updated = await api.updateVehicle(editingVehicle.id, payload);
        updatedList = localVehicles.map((v) => {
          if (v.id === editingVehicle.id) return updated;
          if (payload.isDefault) return { ...v, isDefault: false };
          return v;
        });
        setSuccessNotice(`Updated ${payload.make} ${payload.model} successfully.`);
      } else {
        // Create new vehicle
        const created = await api.createVehicle(payload);
        if (created.isDefault) {
          updatedList = [created, ...localVehicles.map((v) => ({ ...v, isDefault: false }))];
        } else {
          updatedList = [created, ...localVehicles];
        }
        setSuccessNotice(`Added ${payload.make} ${payload.model} to your vehicles.`);
      }

      setLocalVehicles(updatedList);
      if (onVehiclesChange) onVehiclesChange(updatedList);
      setIsModalOpen(false);
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err) {
      setErrorNotice(err.message || 'Could not save vehicle.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefault = async (vehicleId) => {
    try {
      await api.setDefaultVehicle(vehicleId);
      const updatedList = localVehicles.map((v) => ({
        ...v,
        isDefault: v.id === vehicleId
      }));
      setLocalVehicles(updatedList);
      if (onVehiclesChange) onVehiclesChange(updatedList);
      setSuccessNotice('Default vehicle updated.');
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (err) {
      setErrorNotice(err.message || 'Failed to set default vehicle.');
    }
  };

  const handleDelete = async (vehicleId) => {
    try {
      await api.deleteVehicle(vehicleId);
      const updatedList = localVehicles.filter((v) => v.id !== vehicleId);
      // If deleted was default and there are remaining, make first one default
      const hadDefault = localVehicles.find((v) => v.id === vehicleId)?.isDefault;
      if (hadDefault && updatedList.length > 0) {
        updatedList[0].isDefault = true;
      }
      setLocalVehicles(updatedList);
      if (onVehiclesChange) onVehiclesChange(updatedList);
      setDeleteCandidate(null);
      setSuccessNotice('Vehicle removed.');
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (err) {
      setErrorNotice(err.message || 'Failed to remove vehicle.');
    }
  };

  return (
    <div className="container" style={{ maxWidth: '840px' }}>
      {/* Page Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <span className="eyebrow" style={{ color: 'var(--ps-secondary-dark)' }}>DRIVER PROFILE</span>
          <h1 className="page-title" style={{ margin: '0.15rem 0' }}>My Vehicles</h1>
          <p className="metadata">Manage your registered vehicles for quick one-click reservations</p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={openAddModal}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus size={16} />
          <span>+ Add Vehicle</span>
        </button>
      </div>

      {/* Notifications */}
      {successNotice && (
        <div style={{
          backgroundColor: 'var(--ps-state-available-bg)',
          color: 'var(--ps-state-available)',
          border: '1px solid rgba(46, 125, 50, 0.3)',
          borderRadius: 'var(--ps-radius-sm)',
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CheckCircle2 size={16} />
          <span>{successNotice}</span>
        </div>
      )}

      {errorNotice && (
        <div style={{
          backgroundColor: '#FDE8E8',
          color: '#9B1C1C',
          border: '1px solid #F87171',
          borderRadius: 'var(--ps-radius-sm)',
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={16} />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Vehicles Grid / List */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {localVehicles.map((vehicle) => {
          const title = vehicle.nickname || `${vehicle.make} ${vehicle.model}`;
          const isDefault = Boolean(vehicle.isDefault);

          return (
            <div
              key={vehicle.id}
              className="card"
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: isDefault ? '2px solid var(--ps-accent-dark)' : '1px solid var(--ps-secondary-light)',
                backgroundColor: isDefault ? '#FBF9F0' : '#FFFFFF',
                borderRadius: 'var(--ps-radius-md)',
                padding: '1.25rem'
              }}
            >
              <div>
                {/* Default badge or tag */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <Car size={18} color="var(--ps-primary-dark)" />
                    <h3 style={{ fontSize: '1.15rem', color: 'var(--ps-primary-dark)', margin: 0 }}>
                      {title}
                    </h3>
                  </div>

                  {isDefault && (
                    <span style={{
                      backgroundColor: 'var(--ps-accent-light)',
                      color: 'var(--ps-primary-dark)',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.55rem',
                      borderRadius: 'var(--ps-radius-sm)',
                      border: '1px solid var(--ps-accent-dark)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      <Star size={11} fill="currentColor" /> Default
                    </span>
                  )}
                </div>

                {/* Subtitle / Model details if nickname exists */}
                {vehicle.nickname && (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--ps-secondary-dark)', marginBottom: '0.5rem' }}>
                    {vehicle.make} {vehicle.model}
                  </div>
                )}

                {/* Registration plate */}
                <div style={{
                  fontFamily: 'var(--ps-font-mono)',
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: 'var(--ps-primary-dark)',
                  backgroundColor: 'rgba(37, 34, 27, 0.05)',
                  padding: '0.35rem 0.65rem',
                  borderRadius: 'var(--ps-radius-sm)',
                  display: 'inline-block',
                  margin: '0.5rem 0 0.65rem'
                }}>
                  {vehicle.registrationNumber}
                </div>

                {/* Color */}
                {vehicle.color && (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--ps-secondary-dark)', marginBottom: '0.75rem' }}>
                    Color: <strong>{vehicle.color}</strong>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: '1px solid var(--ps-secondary-light)',
                paddingTop: '0.85rem',
                marginTop: '0.5rem'
              }}>
                <div>
                  {!isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(vehicle.id)}
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--ps-secondary-dark)',
                        textDecoration: 'underline',
                        cursor: 'pointer'
                      }}
                    >
                      Make Default
                    </button>
                  )}
                  {isDefault && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--ps-secondary-dark)' }}>
                      Default vehicle
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEditModal(vehicle)}
                    title="Edit vehicle details"
                    style={{ padding: '0.3rem 0.6rem' }}
                  >
                    <Edit2 size={13} /> Edit
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setDeleteCandidate(vehicle)}
                    title="Remove vehicle"
                    style={{ padding: '0.3rem 0.6rem', color: '#9B1C1C' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {localVehicles.length === 0 && !isLoading && (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
          <Car size={42} strokeWidth={1.5} style={{ color: 'var(--ps-secondary-dark)', margin: '0 auto 0.75rem' }} />
          <h3 style={{ marginBottom: '0.35rem' }}>No vehicles registered yet</h3>
          <p className="metadata" style={{ marginBottom: '1.5rem', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            Add your vehicle details once to automatically link registration numbers to your parking reservations and digital passes.
          </p>
          <button type="button" className="btn btn-primary" onClick={openAddModal}>
            <Plus size={16} /> Add Your First Vehicle
          </button>
        </div>
      )}

      {/* ADD / EDIT MODAL */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => !isSubmitting && setIsModalOpen(false)} role="dialog" aria-modal="true">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.35rem', color: 'var(--ps-primary-dark)', margin: 0 }}>
                {editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ps-secondary-dark)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit}>
              {/* Nickname */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" htmlFor="veh-nick">Vehicle Nickname (Optional)</label>
                <input
                  id="veh-nick"
                  type="text"
                  className="form-input"
                  placeholder="e.g. My i20, Family Car"
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                />
              </div>

              {/* Make & Model in two columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="veh-make">Make *</label>
                  <input
                    id="veh-make"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Hyundai"
                    value={formData.make}
                    onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                    required
                  />
                  {formErrors.make && <div style={{ color: '#9B1C1C', fontSize: '0.75rem', marginTop: '0.2rem' }}>{formErrors.make}</div>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="veh-model">Model *</label>
                  <input
                    id="veh-model"
                    type="text"
                    className="form-input"
                    placeholder="e.g. i20"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    required
                  />
                  {formErrors.model && <div style={{ color: '#9B1C1C', fontSize: '0.75rem', marginTop: '0.2rem' }}>{formErrors.model}</div>}
                </div>
              </div>

              {/* Registration Number */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" htmlFor="veh-reg">Registration Number *</label>
                <input
                  id="veh-reg"
                  type="text"
                  className="form-input"
                  placeholder="e.g. GJ18XX1234 or DL01AB4920"
                  value={formData.registrationNumber}
                  onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                  style={{ textTransform: 'uppercase', fontFamily: 'var(--ps-font-mono)' }}
                  required
                />
                {formErrors.registrationNumber && (
                  <div style={{ color: '#9B1C1C', fontSize: '0.75rem', marginTop: '0.2rem' }}>{formErrors.registrationNumber}</div>
                )}
              </div>

              {/* Color */}
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" htmlFor="veh-color">Color (Optional)</label>
                <input
                  id="veh-color"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Silver, White, Midnight Black"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
              </div>

              {/* Default vehicle checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <input
                  id="veh-default"
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="veh-default" style={{ fontSize: '0.875rem', cursor: 'pointer', fontWeight: 600 }}>
                  Set as default vehicle for reservations
                </label>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : editingVehicle ? 'Update Vehicle' : 'Save Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteCandidate && (
        <div className="modal-backdrop" onClick={() => setDeleteCandidate(null)} role="dialog" aria-modal="true">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--ps-primary-dark)' }}>
              Remove Vehicle?
            </h3>
            <p style={{ color: 'var(--ps-secondary-dark)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Are you sure you want to remove <strong>{deleteCandidate.make} {deleteCandidate.model}</strong> ({deleteCandidate.registrationNumber}) from your profile?
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setDeleteCandidate(null)}
              >
                Keep
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, backgroundColor: '#9B1C1C', borderColor: '#9B1C1C', color: '#FFFFFF' }}
                onClick={() => handleDelete(deleteCandidate.id)}
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VehicleManagement;
