import { FastifyInstance } from 'fastify';
import z from 'zod';

import { prisma } from '../../lib/prisma';

export async function createPoll(app: FastifyInstance) {
  app.post('/polls', async (request, reply) => {
    const createPoolBody = z.object({
      title: z.string(),
      options: z.array(z.string()),
    });

    const { title, options } = createPoolBody.parse(request.body);

    const { id: pollId } = await prisma.poll.create({
      data: {
        title,
        options: {
          createMany: {
            data: options.map((option) => ({ title: option })),
          },
        },
      },
    });

    return reply.status(201).send({ pollId });
  });
}
