import Papa from "papaparse";

const csvText = "Nome;Telefone;Email\nJoão;11999999999;joao@email.com\nMaria;11888888888;maria@email.com";

const parsedDefault = Papa.parse(csvText, { skipEmptyLines: true });
console.log("DEFAULT (no delimiter option):", parsedDefault.data);

const parsedAuto = Papa.parse(csvText, { skipEmptyLines: true, delimiter: "" });
console.log("AUTO (delimiter: ''):", parsedAuto.data);
