-- 0111 — a placeholder rate book, a billing target, and the module switched on
-- for the one organization that sells fence.
--
-- EVERY FIGURE HERE IS A PLACEHOLDER. source = 'placeholder' on every row and
-- verified_on is null, which is what a freshness panel reads: nothing prices
-- honestly until On Call's real cost and sell replace these. They exist so the
-- estimator, the quote, the margin floor and the keying sheet can be exercised
-- against something rather than against nothing.

do $$
declare acct uuid := '1ade454c-54e8-45d9-beec-cc52a21f7ea2';
        ent  uuid := 'b533fdcd-5ecb-4a17-a5db-83429feac02c';
begin

  insert into hopper.fence_billing_target (account_id, name, to_email, instructions)
  values (acct, 'Navusoft', 'accounting@oncallsr.com',
          'Key the charge lines against the Navusoft account and service location named above. Attach the project record to the account. Fence Builder never raises the invoice.')
  on conflict (account_id, name) do nothing;

  insert into hopper.fence_rate (account_id, code, kind, grp, cls, name_en, name_es, uom, cost, markup, source) values
    (acct,'CL-FAB6','material','Fabric','permanent','6'' chain link fabric, 9 ga, 3" mesh','Malla ciclónica 1.8 m, cal. 9','lf',3.10,1.42,'placeholder'),
    (acct,'CL-LINE','material','Posts','permanent','Line post, 1⅝" x 8''','Poste intermedio 1⅝" x 2.4 m','ea',14.20,1.42,'placeholder'),
    (acct,'CL-TERM','material','Posts','permanent','Terminal post, 2⅞" x 8''','Poste terminal 2⅞" x 2.4 m','ea',31.80,1.42,'placeholder'),
    (acct,'CL-RAIL','material','Rail','permanent','Top rail, 1⅜"','Riel superior 1⅜"','lf',1.15,1.42,'placeholder'),
    (acct,'CL-TBAR','material','Hardware','permanent','Tension bar','Barra tensora','ea',4.60,1.55,'placeholder'),
    (acct,'CL-TBND','material','Hardware','permanent','Tension band','Abrazadera de tensión','ea',0.85,1.55,'placeholder'),
    (acct,'CL-LOOP','material','Hardware','permanent','Loop cap','Copa pasante','ea',1.20,1.55,'placeholder'),
    (acct,'CL-TIE','material','Hardware','permanent','Tie wire, aluminum','Alambre de amarre, aluminio','ea',0.11,1.55,'placeholder'),
    (acct,'CL-CONC','material','Concrete','permanent','Concrete, 60 lb bag','Concreto, bolsa de 27 kg','ea',6.40,1.35,'placeholder'),
    (acct,'WD-CEDAR','material','Fabric','permanent','Cedar picket, 6'' dog-ear','Tabla de cedro 1.8 m','ea',3.95,1.42,'placeholder'),
    (acct,'WD-RAIL','material','Rail','permanent','Cedar rail, 2x4x8','Travesaño de cedro 2x4x2.4 m','ea',7.20,1.42,'placeholder'),
    (acct,'GATE-WK','material','Gates','permanent','Walk gate, 4'' chain link','Puerta peatonal 1.2 m','ea',186.00,1.48,'placeholder'),
    (acct,'GATE-VD','material','Gates','permanent','Vehicle gate, 16'' double drive','Portón vehicular doble 4.9 m','ea',742.00,1.48,'placeholder'),
    (acct,'SEC-358','material','Security line','secure','8'' anti-climb 358 mesh','Malla antiescalamiento 2.4 m','lf',18.40,1.46,'placeholder'),
    (acct,'SEC-PAL','material','Security line','secure','8'' steel palisade','Empalizada de acero 2.4 m','lf',22.10,1.46,'placeholder'),
    (acct,'SEC-NUT','material','Hardware','secure','Shear nut and clip set','Juego de tuerca de corte y clip','ea',2.30,1.55,'placeholder'),
    (acct,'SEC-DIG','material','Security line','secure','Anti-dig apron','Faldón antiexcavación','lf',9.60,1.46,'placeholder'),
    (acct,'SEC-DET','material','Detection','secure','Sensor cable on fabric','Cable sensor en la malla','lf',11.80,1.46,'placeholder'),
    (acct,'SEC-BOL','material','Security line','secure','Bollard, 6" filled','Bolardo 15 cm relleno','ea',410.00,1.44,'placeholder'),
    (acct,'TF-PNL','fleet','Temporary fence','temporary','Temporary fence panel, 6x12','Panel de cerca temporal 1.8x3.7 m','ea',0,1,'placeholder'),
    (acct,'TF-BASE','fleet','Temporary fence','temporary','Panel base','Base para panel','ea',0,1,'placeholder'),
    (acct,'TF-CLMP','material','Temporary fence','temporary','Panel clamp','Abrazadera de panel','ea',3.40,1.5,'placeholder'),
    (acct,'TF-SAND','material','Temporary fence','temporary','Sandbag','Saco de arena','ea',4.10,1.5,'placeholder'),
    (acct,'LAB-CL','labor','Install','permanent','Chain link install','Instalación de malla ciclónica','crew-hr',96.00,1.85,'placeholder'),
    (acct,'LAB-WD','labor','Install','permanent','Wood privacy install','Instalación de cerca de madera','crew-hr',96.00,1.85,'placeholder'),
    (acct,'LAB-SEC','labor','Install','secure','Secure line install','Instalación de línea segura','crew-hr',112.00,1.85,'placeholder'),
    (acct,'LAB-TF','labor','Install','temporary','Temporary fence set','Colocación de cerca temporal','crew-hr',88.00,1.85,'placeholder'),
    (acct,'LAB-ESC','labor','Install','secure','Escorted day','Día con escolta','crew-hr',112.00,1.85,'placeholder'),
    (acct,'LAB-TEAR','labor','Removal','permanent','Tear-out and haul','Demolición y acarreo','crew-hr',88.00,1.75,'placeholder'),
    (acct,'EQ-AUG','equipment','Equipment','permanent','Auger truck','Camión hoyadora','day',340.00,1.40,'placeholder'),
    (acct,'EQ-TRN','equipment','Equipment','secure','Trencher','Zanjadora','day',295.00,1.40,'placeholder'),
    (acct,'EQ-TEL','equipment','Equipment','secure','Telehandler','Manipulador telescópico','day',480.00,1.40,'placeholder'),
    (acct,'R-DEL','rental','Rental','temporary','Delivery and set','Entrega y colocación','trip',185.00,1.55,'placeholder'),
    (acct,'R-REL','rental','Rental','temporary','Relocation','Reubicación','trip',165.00,1.55,'placeholder'),
    (acct,'R-PU','rental','Rental','temporary','Pickup','Retiro','trip',150.00,1.55,'placeholder'),
    (acct,'R-PNL','rental','Rental','temporary','Panel rent, 28-day cycle','Renta de panel, ciclo de 28 días','ea',1.85,1.95,'placeholder'),
    (acct,'R-SCR','rental','Rental','temporary','Screen rent, 28-day cycle','Renta de malla sombra, ciclo de 28 días','lf',0.42,1.95,'placeholder'),
    (acct,'R-DMG','rental','Rental','temporary','Damage, per panel','Daño, por panel','ea',148.00,1.25,'placeholder')
  on conflict (account_id, code) do nothing;

  insert into hopper.entity_module (account_id, entity_id, module_key, enabled)
  values (acct, ent, 'fence', true)
  on conflict do nothing;

end $$;
