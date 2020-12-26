import fs from 'fs';
import { getRepository, In, getCustomRepository } from 'typeorm';
import csvParse from 'csv-parse';
import Transaction from '../models/Transaction';
import Category from '../models/Category';
import TransactionRepository from '../repositories/TransactionsRepository';

interface CsvTransactions {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}
class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const categoryRepository = getRepository(Category);
    const transactionRepositories = getCustomRepository(TransactionRepository);

    const contactsReadStream = fs.createReadStream(filePath);

    const parsers = csvParse({
      from_line: 2,
    });

    const parseCsv = contactsReadStream.pipe(parsers);

    const transactions: CsvTransactions[] = [];

    const categories: string[] = [];

    parseCsv.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      transactions.push({ title, type, value, category });
      categories.push(category);
    });

    await new Promise(resolve => parseCsv.on('end', resolve));

    const ExistentCategories = await categoryRepository.find({
      where: {
        title: In(categories),
      },
    });

    const ExistentCategoriesTitle = ExistentCategories.map(
      (category: Category) => category.title,
    );

    const addCategoriesTitle = categories
      .filter(category => !ExistentCategoriesTitle.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoryRepository.create(
      addCategoriesTitle.map(title => ({
        title,
      })),
    );

    await categoryRepository.save(newCategories);

    const endCategories = [...newCategories, ...ExistentCategories];

    const createdTransactions = transactionRepositories.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: endCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionRepositories.save(createdTransactions);

    await fs.promises.unlink(filePath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
