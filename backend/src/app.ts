import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import userRoutes from './routes/user.routes';
import donorRoutes from './routes/donor.routes';
import researcherRoutes from './routes/researcher.routes';
import sampleRoutes from './routes/sample.routes';
import lifecycleRoutes from './routes/lifecycle.routes';
import consentRoutes from './routes/consent.routes';
import accessRoutes from './routes/access.routes';
import grantRoutes from './routes/grant.routes';
import documentRoutes from './routes/document.routes';
import auditRoutes from './routes/audit.routes';
import authRoutes from './routes/auth.routes';

const app = express();

app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Stemora API is running' });
});

app.use('/api/users', userRoutes);
app.use('/api/donors', donorRoutes);
app.use('/api/researchers', researcherRoutes);
app.use('/api/samples', sampleRoutes);
app.use('/api/lifecycle', lifecycleRoutes);
app.use('/api/consents', consentRoutes);
app.use('/api/access-requests', accessRoutes);
app.use('/api/access-grants', grantRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/auth', authRoutes);

export default app;
