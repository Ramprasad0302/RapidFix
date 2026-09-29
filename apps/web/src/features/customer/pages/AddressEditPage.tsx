import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddressInput } from '@fixora/shared-utils';
import { Alert, Button } from '@fixora/ui';
import { PageHeader } from '../../../components/PageHeader';
import { CenteredSpinner } from '../../../components/States';
import { customerApi } from '../../../lib/endpoints';
import { toast } from '../../../store/toast';
import { MobileShell } from '../CustomerTabsLayout';
import { AddressForm } from '../components/AddressForm';

export function AddressEditPage() {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const addresses = useQuery({ queryKey: ['customer', 'addresses'], queryFn: customerApi.addresses, enabled: !isNew });
  const existing = addresses.data?.find((a) => a.id === id);

  const save = useMutation({
    mutationFn: (v: AddressInput) => (isNew ? customerApi.createAddress(v) : customerApi.updateAddress(id, v)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customer', 'addresses'] });
      toast(isNew ? 'Address saved' : 'Address updated');
      navigate('/account/addresses', { replace: true });
    },
  });

  return (
    <MobileShell>
      <PageHeader title={isNew ? 'Add Address' : 'Edit Address'} backTo="/account/addresses" />
      <main className="px-4 pb-10">
        {!isNew && addresses.isPending ? (
          <CenteredSpinner />
        ) : (
          <AddressForm
            id="address-form"
            defaultValues={existing ?? undefined}
            onSubmit={(v) => save.mutate(v)}
            footer={
              <>
                {save.isError && <Alert>{save.error.message}</Alert>}
                <Button type="submit" size="lg" fullWidth loading={save.isPending}>
                  Save Address
                </Button>
              </>
            }
          />
        )}
      </main>
    </MobileShell>
  );
}
