-- Due ruoli che esistevano nell'interfaccia ma non nel database (16.9.2026):
-- l'aiuto medico e il tecnico. Senza, ogni persona dello studio doveva
-- entrare come segretaria o come admin, e il registro degli accessi non
-- sapeva distinguere chi fosse.
alter type user_role add value if not exists 'assistente';
alter type user_role add value if not exists 'tecnico';
